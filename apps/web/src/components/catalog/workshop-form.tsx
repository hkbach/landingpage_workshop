"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { z } from "zod";
import { ImageOff, Plus, Trash2, TriangleAlert } from "lucide-react";
import {
  LOCALES, WORKSHOP_ADDRESS_MAX, WORKSHOP_CATEGORIES, formatMoney, minorDigits, missingLocales, trimDeep,
  type Locale, type Localized, type WorkshopCategory, type WorkshopStatus,
} from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ops/field";
import { NativeSelect } from "@/components/ops/native-select";
import { WorkshopStatusBadge } from "./workshop-status-badge";
import { issuesToErrors } from "@/components/ops/validation";
import type { Workshop } from "@/lib/types";
import { LanguageBar } from "@/components/language/LanguageBar";
import { useEditingLanguage } from "@/lib/use-shop-language";
import { useDirty } from "@/lib/use-dirty";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/** Upper bound for capacity until PLAN_LIMITS is wired to the plan (FR-WS-01: 1-50). */
export const MAX_CAPACITY = 50;
const MAX_GALLERY = 6;

export interface ShopForCatalog {
  currency: string; timezone: string; defaultLocale: Locale; enabledLocales: Locale[];
  /** The address of the shop: the one a workshop without an address of its own is held at (said under the field). */
  address?: string;
}

interface Draft {
  title: Localized; shortDescription: Localized; description: Localized; notes: Localized;
  includes: Partial<Record<Locale, string>>; // one item per line
  price: string; durationMinutes: string; defaultCapacity: string; maxPerBooking: string; sortOrder: string;
  coverUrl: string; galleryUrls: string[]; status: WorkshopStatus;
  /** The field of the workshop, "" until the owner picks one. */
  category: WorkshopCategory | "";
  /** Where it takes place; empty = the address of the shop. */
  address: string;
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
    coverUrl: w?.coverUrl ?? "", galleryUrls: [...(w?.galleryUrls ?? [])], status: w?.status ?? "DRAFT", category: w?.category ?? "", address: w?.address ?? "",
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
      category: z.enum(WORKSHOP_CATEGORIES, "errors.categoryRequired"),
      address: z.string().trim().max(WORKSHOP_ADDRESS_MAX, "errors.addressTooLong"),
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
      titleDefault: d.title[shop.defaultLocale] ?? "", category: d.category, address: d.address, price: num(d.price), durationMinutes: num(d.durationMinutes),
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
    setD((p) => trimDeep(p));
    setSaved(true); setVersion((v) => v + 1);
    onStatusChange?.(d.status);
    onSaved?.();
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
            {(p) => <Textarea {...p} rows={2} maxLength={WORKSHOP_ADDRESS_MAX} autoComplete="street-address" value={d.address} onChange={(e) => setField("address", e.target.value)} />}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("form.pricing")}</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field id="ws-category" label={t("form.category")} required error={err("category")} hint={t("form.categoryHint")} className="sm:col-span-2">
            {(p) => (
              <NativeSelect
                {...p} value={d.category} onChange={(e) => setField("category", e.target.value as WorkshopCategory | "")}
                options={[{ value: "", label: t("form.categoryPlaceholder") }, ...WORKSHOP_CATEGORIES.map((c) => ({ value: c, label: t(`categories.${c}`) }))]}
              />
            )}
          </Field>
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
        <Button type="submit" disabled={!dirty}>{t("form.save")}</Button>
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
