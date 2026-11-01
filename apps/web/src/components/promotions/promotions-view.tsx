"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { Pause, Pencil, Play, Plus, Trash2 } from "lucide-react";
import {
  countByStatus, discountedPrice, DISCOUNT_TYPES, formatMoney, minorDigits, pickLocalized, promotionAppliesTo, promotionInputSchema, promotionStatus,
  PROMOTION_DESCRIPTION_MAX, PROMOTION_TITLE_MAX, type DiscountType, type Locale, type Localized, type PromotionRecord, type PromotionStatus,
} from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { Field } from "@/components/ops/field";
import { LanguageBar } from "@/components/language/LanguageBar";
import { parseAmount } from "@/components/finance/finance-store";
import { useEditingLanguage } from "@/lib/use-shop-language";
import { PromotionApiError, deletePromotionRequest, fetchPromotions, savePromotionRequest, setPromotionEnabledRequest } from "@/lib/promotions-api";
import { cn } from "@/lib/utils";

export interface PromotionShop { defaultLocale: Locale; enabledLocales: Locale[]; currency: string }
export interface PromotionWorkshop { id: string; title: Localized; priceAmount: number }

const STATUS_STYLES: Record<PromotionStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-950",
  SCHEDULED: "bg-blue-100 text-blue-950",
  PAUSED: "bg-amber-100 text-amber-950",
  EXPIRED: "bg-slate-200 text-slate-900",
};

interface FormState {
  id: string | null; title: Localized; description: Localized; discountType: DiscountType; value: string; code: string;
  appliesTo: "ALL" | "SELECTED"; workshopIds: string[]; startDate: string; endDate: string; enabled: boolean;
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function PromotionsView({ shop, workshops }: { shop: PromotionShop; workshops: PromotionWorkshop[] }) {
  const t = useTranslations("ops.promotions");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["promotions"], queryFn: fetchPromotions });
  const [filter, setFilter] = useState<"ALL" | PromotionStatus>("ALL");
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<PromotionRecord | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const today = query.data?.today ?? "";
  const items = query.data?.items ?? [];
  const limit = query.data?.limit ?? 0;
  const counts = countByStatus(items, today);
  const rows = items.filter((p) => filter === "ALL" || promotionStatus(p, today) === filter);
  const atLimit = limit > 0 && items.length >= limit;
  const money = (n: number) => formatMoney(n, shop.currency, locale);
  const nameOf = (id: string) => pickLocalized(workshops.find((w) => w.id === id)?.title ?? {}, locale as Locale, shop.defaultLocale);
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const discountText = (p: Pick<PromotionRecord, "discountType" | "discountValue">) =>
    p.discountType === "PERCENT" ? t("offPercent", { value: p.discountValue }) : t("offAmount", { amount: money(p.discountValue) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["promotions"] });
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => setPromotionEnabledRequest(v.id, v.enabled),
    onSuccess: (_p, v) => { setMessage({ text: t(v.enabled ? "resumed" : "paused"), tone: "ok" }); void refresh(); },
    onError: () => { setMessage({ text: t("saveFailed"), tone: "error" }); void refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deletePromotionRequest(id),
    onSuccess: () => { setMessage({ text: t("deleted"), tone: "ok" }); void refresh(); },
    onError: (e) => { setMessage({ text: e instanceof PromotionApiError && e.status === 404 ? t("gone") : t("saveFailed"), tone: "error" }); void refresh(); },
  });

  function openNew() {
    setMessage(null);
    setForm({ id: null, title: {}, description: {}, discountType: "PERCENT", value: "", code: "", appliesTo: "ALL", workshopIds: [], startDate: today, endDate: addDays(today, 30), enabled: true });
  }
  function openEdit(p: PromotionRecord) {
    setMessage(null);
    setForm({
      id: p.id, title: { ...p.title }, description: { ...p.description }, discountType: p.discountType,
      value: p.discountType === "PERCENT" ? String(p.discountValue) : String(p.discountValue / 10 ** minorDigits(shop.currency)),
      code: p.code ?? "", appliesTo: p.appliesTo, workshopIds: [...p.workshopIds], startDate: p.startDate, endDate: p.endDate, enabled: p.enabled,
    });
  }

  const SUMMARY: { key: "ALL" | PromotionStatus; label: string; value: number }[] = [
    { key: "ACTIVE", label: t("status.ACTIVE"), value: counts.ACTIVE }, { key: "SCHEDULED", label: t("status.SCHEDULED"), value: counts.SCHEDULED },
    { key: "PAUSED", label: t("status.PAUSED"), value: counts.PAUSED }, { key: "EXPIRED", label: t("status.EXPIRED"), value: counts.EXPIRED },
    { key: "ALL", label: t("all"), value: counts.total },
  ];

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("landingNote")} <Link href="/shopowner/site" className="underline underline-offset-4">{t("landingLink")}</Link>
          </p>
        </div>
        <div className="grid justify-items-end gap-1">
          <Button onClick={openNew} disabled={!query.data || atLimit}><Plus aria-hidden />{t("create")}</Button>
          {query.data ? <p className="text-xs text-muted-foreground">{atLimit ? t("limitReached", { max: limit }) : t("count", { count: items.length, max: limit })}</p> : null}
        </div>
      </header>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label={t("filterLabel")}>
        {SUMMARY.map((s) => (
          <li key={s.key}>
            <button
              type="button" aria-pressed={filter === s.key} onClick={() => setFilter(s.key)}
              className={cn("w-full rounded-xl border bg-card p-3 text-left outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", filter === s.key && "border-primary ring-2 ring-primary/30")}
            >
              <span className="block text-xs text-muted-foreground">{s.label}</span>
              <span className="block text-2xl font-semibold tabular-nums">{query.data ? s.value : "–"}</span>
            </button>
          </li>
        ))}
      </ul>

      <p role="status" className={cn("min-h-5 text-sm font-medium", message?.tone === "error" ? "text-destructive" : "text-emerald-800")}>{message?.text}</p>

      {query.isPending ? (
        <p role="status" className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
      ) : query.isError ? (
        <div role="alert" className="grid justify-items-center gap-3 rounded-xl border border-destructive/40 p-8 text-center text-sm">
          <p>{t("loadError")}</p>
          <Button size="sm" onClick={() => void query.refetch()}>{t("retry")}</Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">{items.length === 0 ? t("noPromotions") : t("empty")}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map((p) => {
            const status = promotionStatus(p, today);
            const title = pickLocalized(p.title, locale as Locale, shop.defaultLocale);
            return (
              <li key={p.id}>
                <Card className="h-full">
                  <CardContent className="grid h-full content-between gap-4">
                    <div className="grid gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <Badge className={STATUS_STYLES[status]}>{t(`status.${status}`)}</Badge>
                      </div>
                      <p className="text-sm font-medium">{discountText(p)}</p>
                      {pickLocalized(p.description, locale as Locale, shop.defaultLocale) ? <p className="line-clamp-2 text-sm text-muted-foreground">{pickLocalized(p.description, locale as Locale, shop.defaultLocale)}</p> : null}
                      <dl className="grid gap-0.5 text-sm">
                        <div className="flex gap-1"><dt className="text-muted-foreground">{t("period")}:</dt><dd>{t("range", { from: day(p.startDate), to: day(p.endDate) })}</dd></div>
                        <div className="flex gap-1"><dt className="text-muted-foreground">{t("appliesTo")}:</dt><dd>{p.appliesTo === "ALL" ? t("allWorkshops") : p.workshopIds.map(nameOf).join(", ")}</dd></div>
                        {p.code ? <div className="flex gap-1"><dt className="text-muted-foreground">{t("code")}:</dt><dd className="font-mono">{p.code}</dd></div> : null}
                      </dl>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openEdit(p)}><Pencil aria-hidden />{t("edit")}<span className="sr-only">: {title}</span></Button>
                      {status !== "EXPIRED" ? (
                        <Button size="sm" variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: p.id, enabled: !p.enabled })}>
                          {p.enabled ? <Pause aria-hidden /> : <Play aria-hidden />}{p.enabled ? t("pause") : t("resume")}<span className="sr-only">: {title}</span>
                        </Button>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => setDeleting(p)}><Trash2 aria-hidden />{t("delete")}<span className="sr-only">: {title}</span></Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <PromotionDialog
        form={form} setForm={setForm} shop={shop} workshops={workshops} money={money}
        onSaved={(editing) => { setForm(null); setMessage({ text: t(editing ? "updated" : "created"), tone: "ok" }); void refresh(); }}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle", { name: deleting ? pickLocalized(deleting.title, locale as Locale, shop.defaultLocale) : "" })}</DialogTitle>
            <DialogDescription>{t("deleteBody")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (deleting) remove.mutate(deleting.id); setDeleting(null); }}>{t("deleteConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PromotionDialog({ form, setForm, shop, workshops, money, onSaved }: {
  form: FormState | null; setForm: (f: FormState | null) => void; shop: PromotionShop; workshops: PromotionWorkshop[]; money: (n: number) => string;
  onSaved: (editing: boolean) => void;
}) {
  const t = useTranslations("ops.promotions");
  const [lang, setLang] = useEditingLanguage(shop.enabledLocales, shop.defaultLocale);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (v: { id: string | null; input: Parameters<typeof savePromotionRequest>[1] }) => savePromotionRequest(v.id, v.input),
    onSuccess: (_p, v) => onSaved(v.id !== null),
    onError: (e) => {
      if (e instanceof PromotionApiError && e.status === 422) setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, code]) => [k, t(`errors.${code}` as never)])));
      else setFailed(e instanceof PromotionApiError && e.status === 409 ? t("limitReached", { max: 20 }) : t("saveFailed"));
    },
  });
  const set = (patch: Partial<FormState>) => { if (form) { setForm({ ...form, ...patch }); setErrors({}); setFailed(null); } };
  const setLoc = (key: "title" | "description", text: string) => form && set({ [key]: { ...form[key], [lang]: text } });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const value = form.discountType === "PERCENT" ? (/^\d+$/.test(form.value.trim()) ? Number(form.value.trim()) : 0) : (parseAmount(form.value, minorDigits(shop.currency)) ?? 0);
    const parsed = promotionInputSchema.safeParse({
      title: form.title, description: form.description, discountType: form.discountType, discountValue: value, code: form.code || undefined,
      appliesTo: form.appliesTo, workshopIds: form.appliesTo === "ALL" ? [] : form.workshopIds, startDate: form.startDate, endDate: form.endDate, enabled: form.enabled,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= t(`errors.${i.message}` as never);
      setErrors(next);
      return;
    }
    save.mutate({ id: form.id, input: parsed.data });
  }

  // One worked example of the price a guest would pay, so the owner sees what the discount means.
  const example = (() => {
    if (!form) return null;
    const value = form.discountType === "PERCENT" ? Number(form.value) : parseAmount(form.value, minorDigits(shop.currency));
    if (!value || value <= 0 || (form.discountType === "PERCENT" && value > 100)) return null;
    const draft = { appliesTo: form.appliesTo, workshopIds: form.workshopIds, discountType: form.discountType, discountValue: value };
    const w = workshops.find((x) => promotionAppliesTo(draft, x.id));
    return w ? { name: pickLocalized(w.title, lang, shop.defaultLocale), before: money(w.priceAmount), after: money(discountedPrice(w.priceAmount, draft)) } : null;
  })();

  return (
    <Dialog open={form !== null} onOpenChange={(o) => { if (!o) { setForm(null); setErrors({}); setFailed(null); } }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        {form ? (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{form.id ? t("editTitle") : t("createTitle")}</DialogTitle>
              <DialogDescription>{t("formHint")}</DialogDescription>
            </DialogHeader>
            <LanguageBar value={lang} onChange={setLang} enabled={shop.enabledLocales} defaultLocale={shop.defaultLocale} missingByLocale={{}} />
            <Field id="pr-title" label={t("fieldTitle")} required error={errors.title}>
              {(p) => <Input {...p} value={form.title[lang] ?? ""} maxLength={PROMOTION_TITLE_MAX + 20} onChange={(e) => setLoc("title", e.target.value)} autoComplete="off" />}
            </Field>
            <Field id="pr-description" label={t("fieldDescription")} error={errors.description}>
              {(p) => <Textarea {...p} rows={3} value={form.description[lang] ?? ""} maxLength={PROMOTION_DESCRIPTION_MAX + 50} onChange={(e) => setLoc("description", e.target.value)} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pr-type" label={t("fieldType")} required>
                {(p) => (
                  <NativeSelect {...p} value={form.discountType} onChange={(e) => set({ discountType: e.target.value as DiscountType, value: "" })}>
                    {DISCOUNT_TYPES.map((x) => <option key={x} value={x}>{t(`type.${x}`)}</option>)}
                  </NativeSelect>
                )}
              </Field>
              <Field id="pr-value" label={form.discountType === "PERCENT" ? t("fieldPercent") : t("fieldAmount", { currency: shop.currency })} required error={errors.discountValue}>
                {(p) => <Input {...p} inputMode="decimal" value={form.value} onChange={(e) => set({ value: e.target.value })} autoComplete="off" />}
              </Field>
            </div>
            <Field id="pr-code" label={t("fieldCode")} hint={t("codeHint")} error={errors.code}>
              {(p) => <Input {...p} className="font-mono uppercase" value={form.code} maxLength={20} onChange={(e) => set({ code: e.target.value })} autoComplete="off" spellCheck={false} />}
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">{t("fieldAppliesTo")}</legend>
              {(["ALL", "SELECTED"] as const).map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="pr-applies" value={v} checked={form.appliesTo === v} onChange={() => set({ appliesTo: v })} />
                  {t(v === "ALL" ? "allWorkshops" : "selectedWorkshops")}
                </label>
              ))}
              {form.appliesTo === "SELECTED" ? (
                <ul className="grid gap-1.5 rounded-lg border p-3" aria-label={t("fieldWorkshops")}>
                  {workshops.map((w) => (
                    <li key={w.id}>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox" checked={form.workshopIds.includes(w.id)}
                          onChange={(e) => set({ workshopIds: e.target.checked ? [...form.workshopIds, w.id] : form.workshopIds.filter((x) => x !== w.id) })}
                        />
                        {pickLocalized(w.title, lang, shop.defaultLocale)} <span className="text-muted-foreground">· {money(w.priceAmount)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
              {errors.workshopIds ? <p role="alert" className="text-xs text-destructive">{errors.workshopIds}</p> : null}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="pr-start" label={t("fieldStart")} required error={errors.startDate}>
                {(p) => <Input {...p} type="date" value={form.startDate} onChange={(e) => set({ startDate: e.target.value })} />}
              </Field>
              <Field id="pr-end" label={t("fieldEnd")} required error={errors.endDate}>
                {(p) => <Input {...p} type="date" value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />}
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <input id="pr-enabled" type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
              <Label htmlFor="pr-enabled">{t("fieldEnabled")}</Label>
            </div>
            {example ? <p className="rounded-lg bg-muted/50 p-3 text-sm">{t("example", example)}</p> : null}
            <p role="alert" className="min-h-5 text-sm text-destructive">{failed}</p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForm(null)}>{t("cancel")}</Button>
              <Button type="submit" disabled={save.isPending}>{t("save")}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
