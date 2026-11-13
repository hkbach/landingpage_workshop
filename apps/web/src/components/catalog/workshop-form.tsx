"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { ImageOff, MapPin, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  LOCALES, WORKSHOP_ADDRESS_MAX, WORKSHOP_ADDRESS_NOTE_MAX, WORKSHOP_CATEGORIES, WORKSHOP_CATEGORY_MAX, WORKSHOP_CATEGORY_MIN, formatMoney, mapsSearchUrl, minorDigits, missingLocales, toggleCategory, trimDeep,
  type Locale, type Localized, type WorkshopCategory, type WorkshopStatus,
} from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ops/field";
import { cn } from "@/lib/utils";
import { WorkshopStatusBadge } from "./workshop-status-badge";
import { issuesToErrors } from "@/components/ops/validation";
import type { Workshop } from "@/lib/types";
import { LanguageBar } from "@/components/language/LanguageBar";
import { useEditingLanguage } from "@/lib/use-shop-language";
import { useDirty } from "@/lib/use-dirty";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/** Upper bound for capacity (FR-WS-01: 1-50). */
export const MAX_CAPACITY = 50;
const MAX_GALLERY = 6;

export interface ShopForCatalog {
  currency: string; timezone: string; defaultLocale: Locale; enabledLocales: Locale[];
  /** The address of the shop: the one a workshop without an address of its own is held at (said under the field). */
  address?: string;
  /** Connected to the API: Save sends the workshop to the server (the sample data only simulates it). */
  viaApi?: boolean;
}

interface Draft {
  title: Localized; shortDescription: Localized; description: Localized; notes: Localized;
  includes: Partial<Record<Locale, string>>; // one item per line
  price: string; durationMinutes: string; defaultCapacity: string; maxPerBooking: string; sortOrder: string;
  coverUrl: string; galleryUrls: string[]; status: WorkshopStatus;
  /** The categories of the workshop: 1 to 3, none until the owner picks them. */
  categories: WorkshopCategory[];
  /** Where it takes place (one line); empty = the address of the shop. */
  address: string;
  /** A note that goes with the address (the floor, the entrance, where to park...). */
  addressNote: string;
}

type LocalizedKey = "title" | "shortDescription" | "description" | "notes";
const WARN_FIELDS: LocalizedKey[] = ["title", "shortDescription", "description"];

function toDraft(w: Workshop | undefined, currency: string): Draft {
  const digits = minorDigits(currency);
  return {
    title: { ...w?.title }, shortDescription: { ...w?.shortDescription }, description: { ...w?.description }, notes: { ...w?.notes },
    includes: Object.fromEntries(LOCALES.map((l) => [l, (w?.includes?.[l] ?? []).join("\n")])),
    price: w ? String(w.priceAmount / 10 ** digits) : "", durationMinutes: String(w?.durationMinutes ?? 120),
    defaultCapacity: String(w?.defaultCapacity ?? 8), maxPerBooking: String(w?.maxPerBooking ?? 6), sortOrder: String(w?.sortOrder ?? 1),
    coverUrl: w?.coverUrl ?? "", galleryUrls: [...(w?.galleryUrls ?? [])], status: w?.status ?? "DRAFT", categories: [...(w?.categories ?? [])], address: w?.address ?? "", addressNote: w?.addressNote ?? "",
  };
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const url = z.string().trim().refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "errors.urlInvalid");

/** FR-WS-01 workshop form. Mock only: "Save" simulates, nothing is persisted. */
export function WorkshopForm({
  workshop, shop, bookingCount = 0, onStatusChange, onSaved, onCancel,
}: {
  workshop?: Workshop; shop: ShopForCatalog; bookingCount?: number; onStatusChange?: (s: WorkshopStatus) => void;
  /** In a popup (new workshop): called once the workshop is saved, and when the person cancels (the Back link becomes a Cancel button). */
  onSaved?: () => void; onCancel?: () => void;
}) {
  const t = useTranslations("catalog");
  const locale = useLocale();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [d, setD] = useState<Draft>(() => toDraft(workshop, shop.currency));
  const [lang, setLang] = useEditingLanguage(shop.enabledLocales, shop.defaultLocale);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [initialPrice] = useState(d.price);
  const [version, setVersion] = useState(0); // bumped when the data is saved: what is saved is the new starting point
  const dirty = useDirty(d, version);

  const touch = () => setSaved(false);
  const setField = <K extends keyof Draft>(k: K, v: Draft[K]) => { setD((p) => ({ ...p, [k]: v })); setErrors((e) => ({ ...e, [k]: "" })); touch(); };
  const setLoc = (k: LocalizedKey, l: Locale, text: string) => {
    setD((p) => ({ ...p, [k]: { ...p[k], [l]: text } }));
    setErrors((e) => ({ ...e, [`${k}.${l}`]: "" })); touch();
  };

  const missing = (l: Locale) => WARN_FIELDS.filter((f) => missingLocales(d[f], [l]).length > 0);
  const incomplete = shop.enabledLocales.filter((l) => missing(l).length > 0);
  const missingCounts = Object.fromEntries(shop.enabledLocales.map((l) => [l, missing(l).length])) as Partial<Record<Locale, number>>;

  function submit(e: FormEvent) {
    e.preventDefault();
    const schema = z.object({
      titleDefault: z.string().trim().min(1, "errors.titleRequired"),
      categories: z.array(z.enum(WORKSHOP_CATEGORIES, "errors.categoriesRequired"), "errors.categoriesRequired").min(WORKSHOP_CATEGORY_MIN, "errors.categoriesRequired").max(WORKSHOP_CATEGORY_MAX, "errors.categoriesRequired"),
      address: z.string().trim().max(WORKSHOP_ADDRESS_MAX, "errors.addressTooLong"),
      addressNote: z.string().trim().max(WORKSHOP_ADDRESS_NOTE_MAX, "errors.addressNoteTooLong"),
      price: z.number("errors.priceInvalid").min(0, "errors.priceInvalid"),
      durationMinutes: z.number("errors.durationRange").int("errors.durationRange").min(15, "errors.durationRange").max(600, "errors.durationRange"),
      defaultCapacity: z.number("errors.capacityRange").int("errors.capacityRange").min(1, "errors.capacityRange").max(MAX_CAPACITY, "errors.capacityRange"),
      maxPerBooking: z.number("errors.maxPerBookingRange").int("errors.maxPerBookingRange").min(1, "errors.maxPerBookingRange"),
      sortOrder: z.number("errors.sortInvalid").int("errors.sortInvalid"),
      coverUrl: url,
      galleryUrls: z.array(url).max(MAX_GALLERY, "errors.galleryMax"),
    }).superRefine((v, ctx) => {
      if (Number.isFinite(v.maxPerBooking) && v.maxPerBooking > v.defaultCapacity)
        ctx.addIssue({ code: "custom", path: ["maxPerBooking"], message: "errors.maxPerBookingRange" });
    });
    const parsed = schema.safeParse({
      titleDefault: d.title[shop.defaultLocale] ?? "", categories: d.categories, address: d.address, addressNote: d.addressNote, price: num(d.price), durationMinutes: num(d.durationMinutes),
      defaultCapacity: num(d.defaultCapacity), maxPerBooking: num(d.maxPerBooking), sortOrder: num(d.sortOrder),
      coverUrl: d.coverUrl, galleryUrls: d.galleryUrls.filter((u) => u.trim() !== ""),
    });
    if (!parsed.success) {
      const errs = issuesToErrors(parsed.error);
      if (errs.titleDefault) { errs[`title.${shop.defaultLocale}`] = errs.titleDefault; setLang(shop.defaultLocale); }
      setErrors(errs); setSaved(false);
      return;
    }
    setErrors({});
    // Every text is trimmed when the form is submitted (the form then shows what was saved).
    const clean = trimDeep(d);
    setD(clean);
    if (shop.viaApi) {
      void saveToServer(clean);
      return;
    }
    setSaved(true); setVersion((v) => v + 1);
    onStatusChange?.(d.status);
    onSaved?.();
  }

  /** POST (new) or PUT (edit) to the API: the price goes in minor units, one include per line. A refusal puts the server's codes on the fields. */
  async function saveToServer(clean: Draft) {
    if (saving) return;
    setSaving(true);
    const body = {
      title: clean.title, shortDescription: clean.shortDescription, description: clean.description, notes: clean.notes,
      includes: Object.fromEntries(LOCALES.map((l) => [l, (clean.includes[l] ?? "").split("\n").map((x) => x.trim()).filter(Boolean)])),
      durationMinutes: num(clean.durationMinutes), priceAmount: Math.round(num(clean.price) * 10 ** minorDigits(shop.currency)), defaultCapacity: num(clean.defaultCapacity),
      maxPerBooking: num(clean.maxPerBooking), coverUrl: clean.coverUrl.trim(), galleryUrls: clean.galleryUrls.map((u) => u.trim()).filter(Boolean), categories: clean.categories,
      address: clean.address, addressNote: clean.addressNote, sortOrder: num(clean.sortOrder),
    };
    try {
      const res = await fetch(workshop ? `/api/v1/workshops/${encodeURIComponent(workshop.id)}` : "/api/v1/workshops", { method: workshop ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: { details?: { fields?: Record<string, string> } } } | null;
        const fields = payload?.error?.details?.fields ?? {};
        const next: Record<string, string> = {};
        for (const [field, code] of Object.entries(fields)) {
          const key = `errors.${code === "required" && field.startsWith("title") ? "titleRequired" : code}`;
          next[field.startsWith("title") ? `title.${shop.defaultLocale}` : field] = t.has(key as never) ? key : "errors.saveFailed";
        }
        setErrors(Object.keys(next).length > 0 ? next : { form: "errors.saveFailed" });
        setSaved(false);
        return;
      }
      // A new workshop is a draft; the owner may have chosen to switch it on at once.
      if (!workshop && clean.status === "ACTIVE") {
        const made = (await res.json().catch(() => null)) as { id?: string } | null;
        if (made?.id) await fetch(`/api/v1/workshops/${encodeURIComponent(made.id)}/status`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "ACTIVE" }) }).catch(() => null);
      }
      setSaved(true); setVersion((v) => v + 1);
      onStatusChange?.(clean.status);
      router.refresh();
      onSaved?.();
    } catch {
      setErrors({ form: "errors.saveFailed" });
    } finally {
      setSaving(false);
    }
  }

  const err = (k: string) => (errors[k] ? t(errors[k]) : undefined);
  const galleryKey = Object.keys(errors).find((k) => k.startsWith("galleryUrls") && errors[k]);
  const galleryError = galleryKey ? t(errors[galleryKey] as string) : undefined;
  const priceMinor = Math.round(num(d.price) * 10 ** minorDigits(shop.currency));
  const priceChanged = workshop !== undefined && d.price !== initialPrice;

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("form.content")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("form.contentHint")}</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LanguageBar value={lang} onChange={setLang} enabled={shop.enabledLocales} defaultLocale={shop.defaultLocale} missingByLocale={missingCounts} />
          {((l) => (
              <>
                <Field id={`title-${l}`} label={t("form.title")} required={l === shop.defaultLocale} error={err(`title.${l}`)}>
                  {(p) => <Input {...p} lang={l} maxLength={120} value={d.title[l] ?? ""} onChange={(e) => setLoc("title", l, e.target.value)} />}
                </Field>
                <Field id={`short-${l}`} label={t("form.shortDescription")}>
                  {(p) => <Input {...p} lang={l} maxLength={200} value={d.shortDescription[l] ?? ""} onChange={(e) => setLoc("shortDescription", l, e.target.value)} />}
                </Field>
                <Field id={`desc-${l}`} label={t("form.description")}>
                  {(p) => <Textarea {...p} lang={l} rows={5} value={d.description[l] ?? ""} onChange={(e) => setLoc("description", l, e.target.value)} />}
                </Field>
                <Field id={`inc-${l}`} label={t("form.includes")} hint={t("form.includesHint")}>
                  {(p) => <Textarea {...p} lang={l} rows={4} value={d.includes[l] ?? ""} onChange={(e) => { setD((x) => ({ ...x, includes: { ...x.includes, [l]: e.target.value } })); touch(); }} />}
                </Field>
                <Field id={`notes-${l}`} label={t("form.notes")} hint={t("form.notesHint")}>
                  {(p) => <Textarea {...p} lang={l} rows={3} value={d.notes[l] ?? ""} onChange={(e) => setLoc("notes", l, e.target.value)} />}
                </Field>
              </>
          ))(lang)}
          {incomplete.length > 0 ? (
            <div role="status" className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium">{t("form.missingTitle")}</p>
                <ul className="list-disc pl-5">
                  {incomplete.map((l) => (
                    <li key={l}>{t(`lang.${l}`)}: {missing(l).map((f) => t(`form.${f}`)).join(", ")}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">{t("form.missingHint")}</p>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("form.location")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Field
            id="ws-address" label={t("form.address")} error={errors.address ? t("errors.addressTooLong", { max: WORKSHOP_ADDRESS_MAX }) : undefined}
            hint={t("form.addressHint", { address: shop.address ?? "" })}
          >
            {(p) => (
              // The textbox and, beside it, a button that opens the address that was typed in Google Maps (a new tab; nothing to open while the box is empty).
              <div className="flex items-start gap-2">
                <Input {...p} type="text" className="flex-1" maxLength={WORKSHOP_ADDRESS_MAX} autoComplete="street-address" value={d.address} onChange={(e) => setField("address", e.target.value)} />
                {d.address.trim() ? (
                  <a
                    href={mapsSearchUrl(d.address)} target="_blank" rel="noopener noreferrer" aria-label={t("form.openMapLabel")} data-testid="workshop-address-map"
                    className={buttonVariants({ variant: "outline" })}
                  >
                    <MapPin aria-hidden="true" />
                    {t("form.openMap")}
                  </a>
                ) : (
                  <Button type="button" variant="outline" disabled aria-label={t("form.openMapLabel")} data-testid="workshop-address-map">
                    <MapPin aria-hidden="true" />
                    {t("form.openMap")}
                  </Button>
                )}
              </div>
            )}
          </Field>
          <Field
            id="ws-address-note" label={t("form.addressNote")} hint={t("form.addressNoteHint")}
            error={errors.addressNote ? t("errors.addressNoteTooLong", { max: WORKSHOP_ADDRESS_NOTE_MAX }) : undefined}
          >
            {(p) => <Textarea {...p} rows={3} maxLength={WORKSHOP_ADDRESS_NOTE_MAX} value={d.addressNote} onChange={(e) => setField("addressNote", e.target.value)} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("form.pricing")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {/* 1 to 3 categories, as chips like the ones a guest picks when they register. A fourth one is not taken: one has to be taken out first. */}
          <fieldset className="grid content-start gap-2 sm:col-span-2" aria-describedby="ws-categories-hint" data-testid="workshop-categories">
            <legend className="text-sm font-medium">{t("form.categories")} <span aria-hidden className="text-destructive">*</span></legend>
            <p id="ws-categories-hint" className="text-xs text-muted-foreground">{t("form.categoriesHint")}</p>
            <div className="flex flex-wrap gap-2">
              {WORKSHOP_CATEGORIES.map((c) => {
                const on = d.categories.includes(c);
                const full = !on && d.categories.length >= WORKSHOP_CATEGORY_MAX;
                return (
                  <label
                    key={c}
                    className={cn("relative inline-flex min-h-9 cursor-pointer items-center rounded-full border px-3 py-1 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                      on ? "border-foreground bg-foreground text-background" : "bg-background", full && "cursor-not-allowed opacity-50")}
                  >
                    <input type="checkbox" className="sr-only" name="ws-category" value={c} checked={on} disabled={full} onChange={() => setField("categories", toggleCategory(d.categories, c, WORKSHOP_CATEGORY_MAX))} />
                    {t(`categories.${c}`)}
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground" aria-live="polite">{t("form.categoriesCount", { count: d.categories.length, max: WORKSHOP_CATEGORY_MAX })}</p>
            {err("categories") ? <p role="alert" id="ws-categories-error" className="text-xs text-destructive">{err("categories")}</p> : null}
          </fieldset>
          <Field id="ws-price" label={t("form.price", { currency: shop.currency })} required error={err("price")}
            hint={Number.isFinite(priceMinor) ? t("form.pricePreview", { value: formatMoney(priceMinor, shop.currency, locale) }) : undefined}>
            {(p) => <Input {...p} inputMode="decimal" value={d.price} onChange={(e) => setField("price", e.target.value)} />}
          </Field>
          <Field id="ws-currency" label={t("form.currency")} hint={t("form.currencyHint")}>
            {(p) => <Input {...p} value={shop.currency} disabled readOnly />}
          </Field>
          {priceChanged ? <p className="text-xs text-muted-foreground sm:col-span-2">{t("form.priceChangeNote")}</p> : null}
          <Field id="ws-duration" label={t("form.duration")} required error={err("durationMinutes")} hint={t("form.durationHint")}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={15} max={600} value={d.durationMinutes} onChange={(e) => setField("durationMinutes", e.target.value)} />}
          </Field>
          <Field id="ws-capacity" label={t("form.capacity")} required error={err("defaultCapacity")} hint={t("form.capacityHint", { max: MAX_CAPACITY })}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} value={d.defaultCapacity} onChange={(e) => setField("defaultCapacity", e.target.value)} />}
          </Field>
          <Field id="ws-max" label={t("form.maxPerBooking")} required error={err("maxPerBooking")} hint={t("form.maxPerBookingHint")}>
            {(p) => <Input {...p} type="number" inputMode="numeric" min={1} max={MAX_CAPACITY} value={d.maxPerBooking} onChange={(e) => setField("maxPerBooking", e.target.value)} />}
          </Field>
          <Field id="ws-sort" label={t("form.sortOrder")} error={err("sortOrder")} hint={t("form.sortOrderHint")}>
            {(p) => <Input {...p} type="number" inputMode="numeric" value={d.sortOrder} onChange={(e) => setField("sortOrder", e.target.value)} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("form.images")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("form.imagesHint", { max: MAX_GALLERY })}</p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground" aria-disabled="true">
            <ImageOff className="size-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{t("form.uploaderStub")}</span>
            <Button type="button" variant="outline" disabled>{t("form.upload")}</Button>
          </div>
          <Field id="ws-cover" label={t("form.coverUrl")} error={err("coverUrl")}>
            {(p) => <Input {...p} type="text" inputMode="url" placeholder="https://" value={d.coverUrl} onChange={(e) => setField("coverUrl", e.target.value)} />}
          </Field>
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">{t("form.gallery")}</legend>
            {d.galleryUrls.map((g, i) => (
              <div key={i} className="flex items-start gap-2">
                <Input
                  type="text" inputMode="url" placeholder="https://" value={g} aria-label={t("form.galleryItem", { n: i + 1 })}
                  onChange={(e) => setField("galleryUrls", d.galleryUrls.map((x, j) => (j === i ? e.target.value : x)))}
                />
                <Button type="button" variant="outline" size="icon" aria-label={t("form.removeImage", { n: i + 1 })}
                  onClick={() => setField("galleryUrls", d.galleryUrls.filter((_, j) => j !== i))}>
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            {galleryError ? <p role="alert" className="text-xs text-destructive">{galleryError}</p> : null}
            <div>
              <Button type="button" variant="outline" size="sm" disabled={d.galleryUrls.length >= MAX_GALLERY}
                onClick={() => setField("galleryUrls", [...d.galleryUrls, ""])}>
                <Plus aria-hidden="true" />
                {t("form.addImage")}
              </Button>
            </div>
          </fieldset>
        </CardContent>
      </Card>

      {/* A new workshop has no visibility to choose: it is always saved as a draft (its `status` starts as DRAFT). */}
      {workshop ? (
        <Card>
          <CardHeader><CardTitle>{t("form.visibility")}</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {/* The status is switched with Activate / Deactivate in the workshop list (it needs every session to be closed), not here. */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t("form.status")}:</span>
              <WorkshopStatusBadge status={d.status} />
              <span className="text-xs text-muted-foreground">{t("form.statusFromList")}</span>
            </div>
            <p className="text-xs text-muted-foreground">{bookingCount > 0 ? t("form.hasBookings", { count: bookingCount }) : t("form.noDelete")}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {errors.form ? <p role="alert" className="text-sm text-destructive" data-testid="workshop-save-error">{t(errors.form)}</p> : null}
        <Button type="submit" disabled={!dirty || saving}>{t("form.save")}</Button>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>{t("form.cancel")}</Button>
        ) : (
          <ShopLink href="/shopowner/workshops" className={buttonVariants({ variant: "outline" })}>{t("form.back")}</ShopLink>
        )}
      </div>
      <p role="status" className="text-sm text-emerald-800 empty:hidden">{saved ? t("form.savedSim") : ""}</p>
      {Object.values(errors).some(Boolean) ? <p role="alert" className="text-sm text-destructive">{t("form.fixErrors")}</p> : null}

    </form>
  );
}
