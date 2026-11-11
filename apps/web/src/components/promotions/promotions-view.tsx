"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useDirty } from "@/lib/use-dirty";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { ImageIcon, OctagonX, Pause, Pencil, Play, Plus, RefreshCw, Trash2, TriangleAlert } from "lucide-react";
import {
  countByStatus, discountedPrice, DISCOUNT_TYPES, filterPromotions, formatMoney, fullDiscountWorkshops, isPromotionCodeTaken, isPromotionDeletable, minorDigits, OVER_BUDGET_PERCENT, overBudgetWorkshops, pickLocalized, promotionAppliesTo,
  promotionInputSchema, promotionStatus, PROMOTION_DESCRIPTION_MAX, PROMOTION_TITLE_MAX, STACKING_MODES,
  type DiscountType, type Locale, type Localized, type OverBudgetWorkshop, type PromotionInput, type PromotionRecord, type PromotionStatus, type StackingMode,
} from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { usePagination } from "@/lib/pagination";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { Field } from "@/components/ops/field";
import { LanguageBar } from "@/components/language/LanguageBar";
import { ImageUploadField } from "@/components/builder/ImageUploadField";
import { promotionImageUploader } from "@/lib/media/promotion-uploader";
import { parseAmount } from "@/lib/parse-amount";
import { useEditingLanguage } from "@/lib/use-shop-language";
import { PromotionApiError, deletePromotionRequest, fetchPromotions, savePromotionRequest, setPromotionEnabledRequest } from "@/lib/promotions-api";
import { cn } from "@/lib/utils";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

export interface PromotionShop { defaultLocale: Locale; enabledLocales: Locale[]; currency: string }
export interface PromotionWorkshop { id: string; title: Localized; priceAmount: number }

const STATUS_STYLES: Record<PromotionStatus, string> = {
  ACTIVE: "bg-emerald-100 text-emerald-950",
  SCHEDULED: "bg-blue-100 text-blue-950",
  PAUSED: "bg-amber-100 text-amber-950",
  EXPIRED: "bg-slate-200 text-slate-900",
};

interface FormState {
  id: string | null; title: Localized; description: Localized; discountType: DiscountType; value: string; code: string; imageUrl: string; stacking: StackingMode;
  appliesTo: "ALL" | "SELECTED"; workshopIds: string[]; startDate: string; endDate: string; enabled: boolean;
  /** Set when an expired promotion is renewed: the old first day, which the owner is asked to change. */
  renewFrom?: string;
}

/** A message that needs the shop owner's attention is shown in a pop-up, not on the top of the page. */
interface Notice { title: string; body: string }

type T = (key: string, values?: Record<string, string | number>) => string;

/** The pop-up for a refused save: the limits get their own explanation. Null for any other failure. */
function limitNotice(e: unknown, t: T, day: (d: string) => string): Notice | null {
  if (!(e instanceof PromotionApiError) || e.status !== 409) return null;
  if (e.code === "CONCURRENT_LIMIT") {
    return { title: t("concurrentTitle"), body: t("concurrentLimit", { max: Number(e.details.max ?? 5), date: day(String(e.details.date ?? "")) }) };
  }
  return { title: t("limitTitle"), body: t("limitReached", { max: Number(e.details.max ?? 20) }) };
}

/** The pop-up for a promotion that cannot be paused because guests are using it in bookings of sessions that have not ended. */
function inUseNotice(e: unknown, t: T): Notice | null {
  if (!(e instanceof PromotionApiError) || e.code !== "PROMOTION_IN_USE") return null;
  const codes = Array.isArray(e.details.bookingCodes) ? (e.details.bookingCodes as string[]) : [];
  const count = Number(e.details.count ?? codes.length);
  const shown = codes.slice(0, 5).join(", ") + (count > 5 ? ` +${count - 5}` : "");
  return { title: t("pauseBlockedTitle"), body: t("pauseBlockedBody", { count, codes: shown }) };
}

/** The pop-up for a delete the server refused (the button is also off for promotions that are active or still to start). */
function deleteNotice(e: unknown, t: T): Notice | null {
  return e instanceof PromotionApiError && e.code === "DELETE_NOT_ALLOWED" ? { title: t("deleteBlockedTitle"), body: t("deleteBlockedBody") } : null;
}

/** The pop-up for a promotion that would make workshops free (also answered by the server). Null for any other failure. */
function fullDiscountNotice(e: unknown, t: T, nameOf: (id: string) => string, titleKey: string = "fullDiscountTitle"): Notice | null {
  if (!(e instanceof PromotionApiError) || e.code !== "FULL_DISCOUNT") return null;
  const ids = Array.isArray(e.details.workshopIds) ? (e.details.workshopIds as string[]) : [];
  return { title: t(titleKey), body: t("fullDiscountBody", { workshops: ids.map(nameOf).join(", ") }) };
}

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

interface Filters { q: string; status: "" | PromotionStatus; workshopId: string; from: string; to: string }
const NO_FILTERS: Filters = { q: "", status: "", workshopId: "", from: "", to: "" };

export function PromotionsView({ shop, workshops }: { shop: PromotionShop; workshops: PromotionWorkshop[] }) {
  const t = useTranslations("ops.promotions");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["promotions"], queryFn: fetchPromotions });
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<PromotionRecord | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  const today = query.data?.today ?? "";
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const limit = query.data?.limit ?? 0;
  const counts = countByStatus(items, today);
  const maxConcurrent = query.data?.maxConcurrent ?? 5;
  const rows = useMemo(
    () => filterPromotions(items, { q: filters.q, status: filters.status || undefined, workshopId: filters.workshopId || undefined, from: filters.from || undefined, to: filters.to || undefined }, today),
    [items, filters, today],
  );
  const filtered = JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const pg = usePagination(rows, JSON.stringify(filters));
  const atLimit = limit > 0 && items.length >= limit;
  const money = (n: number) => formatMoney(n, shop.currency, locale);
  const nameOf = (id: string) => pickLocalized(workshops.find((w) => w.id === id)?.title ?? {}, locale as Locale, shop.defaultLocale);
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const discountText = (p: Pick<PromotionRecord, "discountType" | "discountValue">) =>
    p.discountType === "PERCENT" ? t("offPercent", { value: p.discountValue }) : t("offAmount", { amount: money(p.discountValue) });
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters((f) => ({ ...f, [key]: value }));

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["promotions"] });
  const toggle = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => setPromotionEnabledRequest(v.id, v.enabled),
    onSuccess: (p, v) => {
      const started = promotionStatus(p, today) === "ACTIVE" ? t("startedActive") : t("startedScheduled", { date: day(p.startDate) });
      setMessage({ text: v.enabled ? started : t("paused"), tone: "ok" });
      void refresh();
    },
    onError: (e) => {
      const n = inUseNotice(e, t) ?? fullDiscountNotice(e, t, nameOf, "fullDiscountResumeTitle") ?? limitNotice(e, t, day);
      if (n) setNotice(n); else setMessage({ text: e instanceof PromotionApiError && e.code === "HELD_BY_ADMIN" ? t("heldByAdminError") : t("saveFailed"), tone: "error" });
      void refresh();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => deletePromotionRequest(id),
    onSuccess: () => { setMessage({ text: t("deleted"), tone: "ok" }); void refresh(); },
    onError: (e) => {
      const n = deleteNotice(e, t);
      if (n) setNotice(n); else setMessage({ text: e instanceof PromotionApiError && e.status === 404 ? t("gone") : t("saveFailed"), tone: "error" });
      void refresh();
    },
  });

  function openNew() {
    setMessage(null);
    setForm({ id: null, title: {}, description: {}, discountType: "PERCENT", value: "", code: "", imageUrl: "", stacking: "SINGLE", appliesTo: "ALL", workshopIds: [], startDate: today, endDate: addDays(today, 30), enabled: false });
  }
  function openEdit(p: PromotionRecord, renew = false) {
    setMessage(null);
    setForm({
      ...(renew ? { renewFrom: p.startDate } : {}),
      id: p.id, title: { ...p.title }, description: { ...p.description }, discountType: p.discountType,
      value: p.discountType === "PERCENT" ? String(p.discountValue) : String(p.discountValue / 10 ** minorDigits(shop.currency)),
      code: p.code, imageUrl: p.imageUrl ?? "", stacking: p.stacking, appliesTo: p.appliesTo, workshopIds: [...p.workshopIds], startDate: p.startDate, endDate: p.endDate, enabled: false, // a saved promotion is Paused: the Start button runs it
    });
  }

  const SUMMARY: { key: "" | PromotionStatus; label: string; value: number }[] = [
    { key: "ACTIVE", label: t("status.ACTIVE"), value: counts.ACTIVE }, { key: "SCHEDULED", label: t("status.SCHEDULED"), value: counts.SCHEDULED },
    { key: "PAUSED", label: t("status.PAUSED"), value: counts.PAUSED }, { key: "EXPIRED", label: t("status.EXPIRED"), value: counts.EXPIRED },
    { key: "", label: t("all"), value: counts.total },
  ];

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("landingNote")} <ShopLink href="/shopowner/site" className="underline underline-offset-4">{t("landingLink")}</ShopLink>
          </p>
        </div>
        <div className="grid justify-items-end gap-1">
          <Button onClick={openNew} disabled={!query.data || atLimit}><Plus aria-hidden />{t("create")}</Button>
          {query.data ? <p className="text-xs text-muted-foreground">{atLimit ? t("limitReached", { max: limit }) : t("count", { count: items.length, max: limit })}</p> : null}
        </div>
      </header>

      <Card>
        <CardContent>
          {query.data ? (
            <p className="text-sm" data-testid="running-count">{t("running", { count: counts.ACTIVE, max: maxConcurrent })} <span className="text-muted-foreground">{t("runningHint", { max: maxConcurrent })}</span></p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          )}
        </CardContent>
      </Card>

      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label={t("filterLabel")}>
        {SUMMARY.map((s) => (
          <li key={s.key || "all"}>
            <button
              type="button" aria-pressed={filters.status === s.key} onClick={() => setFilter("status", s.key)}
              className={cn("w-full rounded-xl border bg-card p-3 text-left outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", filters.status === s.key && "border-primary ring-2 ring-primary/30")}
            >
              <span className="block text-xs text-muted-foreground">{s.label}</span>
              <span className="block text-2xl font-semibold tabular-nums">{query.data ? s.value : "–"}</span>
            </button>
          </li>
        ))}
      </ul>

      <Card>
        <CardContent className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]" role="search" aria-label={t("searchLabel")}>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="fl-q">{t("searchTitle")}</Label>
              <Input id="fl-q" type="search" value={filters.q} maxLength={80} placeholder={t("searchPlaceholder")} onChange={(e) => setFilter("q", e.target.value)} autoComplete="off" />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="fl-from">{t("periodFrom")}</Label>
              <DateInput id="fl-from" value={filters.from} onChange={(day) => setFilter("from", day)} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="fl-to">{t("periodTo")}</Label>
              <DateInput id="fl-to" value={filters.to} onChange={(day) => setFilter("to", day)} />
            </div>
            <div className="grid content-start gap-1.5">
              <Label htmlFor="fl-workshop">{t("workshopFilter")}</Label>
              <NativeSelect id="fl-workshop" value={filters.workshopId} onChange={(e) => setFilter("workshopId", e.target.value)}>
                <option value="">{t("allWorkshopsOption")}</option>
                {workshops.map((w) => <option key={w.id} value={w.id}>{nameOf(w.id)}</option>)}
              </NativeSelect>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p aria-live="polite" data-testid="result-count" className="text-muted-foreground">{query.data ? t("showing", { shown: rows.length, total: items.length }) : null}</p>
            {filtered ? <Button size="sm" variant="ghost" onClick={() => setFilters(NO_FILTERS)}>{t("clearFilters")}</Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card data-testid="buttons-help">
        <CardContent className="grid gap-1.5 text-sm">
          <p className="font-medium">{t("noteTitle")}</p>
          <ul className="grid gap-1.5 text-muted-foreground">
            {([[Pencil, "noteEdit"], [Trash2, "noteDelete"], [RefreshCw, "noteStart"]] as const).map(([Icon, key]) => (
              <li key={key} className="flex items-start gap-2"><Icon className="mt-0.5 size-4 shrink-0 text-foreground" aria-hidden />{t(key)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

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
        <div className="overflow-x-auto rounded-xl border bg-card">
          <Table data-testid="promotions-table">
            <TableHeader>
              <TableRow>
                <TableHead>{t("colPromotion")}</TableHead>
                <TableHead>{t("colDiscount")}</TableHead>
                <TableHead>{t("period")}</TableHead>
                <TableHead>{t("appliesTo")}</TableHead>
                <TableHead>{t("colStatus")}</TableHead>
                <TableHead>{t("usage")}</TableHead>
                <TableHead><span className="sr-only">{t("colActions")}</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pg.items.map((p) => {
                const status = promotionStatus(p, today);
                const title = pickLocalized(p.title, locale as Locale, shop.defaultLocale);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="min-w-52">
                      <div className="flex items-center gap-3">
                        {p.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.imageUrl} alt="" className="h-10 w-14 shrink-0 rounded-md object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="grid h-10 w-14 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground" aria-hidden><ImageIcon className="size-4" /></span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{title}</p>
                          {p.code ? <p className="font-mono text-xs text-muted-foreground">{p.code}</p> : null}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-medium">{discountText(p)}</TableCell>
                    <TableCell className="min-w-36 whitespace-normal text-sm">{t("range", { from: day(p.startDate), to: day(p.endDate) })}</TableCell>
                    <TableCell className="min-w-32 max-w-56 whitespace-normal text-sm">{p.appliesTo === "ALL" ? t("allWorkshops") : p.workshopIds.map(nameOf).join(", ")}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_STYLES[status]}>{t(`status.${status}`)}</Badge>
                      {p.heldByAdmin ? <p className="mt-1 max-w-48 whitespace-normal text-xs text-amber-800" data-testid="promotion-held">{t("heldByAdmin", { reason: p.heldByAdmin })}</p> : null}
                    </TableCell>
                    <TableCell className="min-w-28 whitespace-normal text-sm">{t(`stackingOption.${p.stacking}.label`)}</TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {/* Active and scheduled promotions have no Edit and Delete: pause them first. */}
                      {status === "PAUSED" ? (
                        <Button size="icon-sm" variant="ghost" title={t("edit")} onClick={() => openEdit(p)}>
                          <Pencil aria-hidden /><span className="sr-only">{t("edit")}: {title}</span>
                        </Button>
                      ) : null}
                      {status === "EXPIRED" ? (
                        <Button size="icon-sm" variant="ghost" title={t("renew")} onClick={() => openEdit(p, true)}><RefreshCw aria-hidden /><span className="sr-only">{t("renew")}: {title}</span></Button>
                      ) : null}
                      {status === "ACTIVE" || status === "SCHEDULED" ? (
                        <Button size="icon-sm" variant="ghost" title={t("pause")} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: p.id, enabled: false })}>
                          <Pause aria-hidden /><span className="sr-only">{t("pause")}: {title}</span>
                        </Button>
                      ) : null}
                      {status === "PAUSED" ? (
                        <Button
                          size="icon-sm" variant="ghost" disabled={toggle.isPending || p.endDate < today || Boolean(p.heldByAdmin)} title={p.heldByAdmin ? t("heldByAdminTitle") : p.endDate < today ? t("startExpired") : t("start")}
                          onClick={() => toggle.mutate({ id: p.id, enabled: true })}
                        >
                          <Play aria-hidden /><span className="sr-only">{t("start")}: {title}</span>
                        </Button>
                      ) : null}
                      {isPromotionDeletable(p, today) ? (
                        <Button size="icon-sm" variant="ghost" title={t("delete")} onClick={() => setDeleting(p)}>
                          <Trash2 aria-hidden /><span className="sr-only">{t("delete")}: {title}</span>
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationBar {...pg.bar} />
        </div>
      )}

      <PromotionDialog
        form={form} setForm={setForm} today={today} shop={shop} workshops={workshops} others={items} money={money} day={day} onNotice={setNotice}
        onSaved={(editing) => { setForm(null); setMessage({ text: t(editing ? "updated" : "created"), tone: "ok" }); void refresh(); }}
      />

      <Dialog open={notice !== null} onOpenChange={(o) => { if (!o) setNotice(null); }}>
        <DialogContent role="alertdialog" data-testid="notice-popup">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TriangleAlert className="size-5 text-amber-700" aria-hidden />{notice?.title}</DialogTitle>
            <DialogDescription>{notice?.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter><Button onClick={() => setNotice(null)}>{t("ok")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

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

/** What the form holds, as far as it is valid (null while something is missing): used to check the budget while the owner types. */
function readForm(form: FormState, currency: string) {
  const value = form.discountType === "PERCENT" ? (/^\d+$/.test(form.value.trim()) ? Number(form.value.trim()) : 0) : (parseAmount(form.value, minorDigits(currency)) ?? 0);
  return promotionInputSchema.safeParse({
    title: form.title, description: form.description, discountType: form.discountType, discountValue: value, code: form.code, imageUrl: form.imageUrl, stacking: form.stacking,
    appliesTo: form.appliesTo, workshopIds: form.appliesTo === "ALL" ? [] : form.workshopIds, startDate: form.startDate, endDate: form.endDate, enabled: form.enabled,
  });
}

function PromotionDialog({ form, setForm, today, shop, workshops, others, money, day, onNotice, onSaved }: {
  form: FormState | null; setForm: (f: FormState | null) => void; today: string; shop: PromotionShop; workshops: PromotionWorkshop[]; others: PromotionRecord[];
  money: (n: number) => string; day: (d: string) => string; onNotice: (n: Notice) => void; onSaved: (editing: boolean) => void;
}) {
  const t = useTranslations("ops.promotions");
  const [lang, setLang] = useEditingLanguage(shop.enabledLocales, shop.defaultLocale);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<string | null>(null);
  /** The valid form waiting for the owner to confirm that a very deep discount is intended. */
  const [confirming, setConfirming] = useState<{ id: string | null; input: PromotionInput } | null>(null);
  const save = useMutation({
    mutationFn: (v: { id: string | null; input: PromotionInput }) => savePromotionRequest(v.id, v.input),
    onSuccess: (_p, v) => onSaved(v.id !== null),
    onError: (e) => {
      const refused = inUseNotice(e, t) ?? fullDiscountNotice(e, t, workshopName);
      if (refused) { onNotice(refused); return; }
      if (e instanceof PromotionApiError && e.status === 422) setErrors(Object.fromEntries(Object.entries(e.fields).map(([k, code]) => [k, t(`errors.${code}` as never)])));
      else {
        const n = limitNotice(e, t, day);
        if (n) onNotice(n); else setFailed(t("saveFailed"));
      }
    },
  });
  const dirty = useDirty(form, form ? (form.id ?? "new") : null);
  const renewing = form?.renewFrom !== undefined && form.startDate === form.renewFrom;
  useEffect(() => {
    if (!form?.renewFrom) return;
    const timer = setTimeout(() => document.getElementById("pr-start")?.focus(), 80);
    return () => clearTimeout(timer);
  }, [form?.id, form?.renewFrom]);
  const set = (patch: Partial<FormState>) => { if (form) { setForm({ ...form, ...patch }); setErrors({}); setFailed(null); } };
  const setLoc = (key: "title" | "description", text: string) => form && set({ [key]: { ...form[key], [lang]: text } });
  const workshopName = (id: string) => pickLocalized(workshops.find((w) => w.id === id)?.title ?? {}, lang, shop.defaultLocale);

  /**
   * `full`: workshops this promotion could make free (100% off), next to the promotions already running on the same days: it cannot be
   * saved. `risks`: workshops it could take to OVER_BUDGET_PERCENT off or more: a warning, shown only when nothing is blocked.
   */
  const { full, risks } = useMemo(() => {
    const none = { full: [] as OverBudgetWorkshop[], risks: [] as OverBudgetWorkshop[] };
    if (!form) return none;
    const parsed = readForm(form, shop.currency);
    if (!parsed.success) return none;
    // Checked as if it ran: the Start button is what makes it run, and by then it must already be safe.
    const candidate = { id: form.id ?? "new", ...parsed.data, enabled: true, workshopIds: parsed.data.appliesTo === "ALL" ? [] : parsed.data.workshopIds };
    const blocked = fullDiscountWorkshops(candidate, others, workshops, today || undefined);
    return { full: blocked, risks: blocked.length > 0 ? [] : overBudgetWorkshops(candidate, others, workshops, undefined, today || undefined) };
  }, [form, shop.currency, others, workshops, today]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const parsed = readForm(form, shop.currency);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= t(`errors.${i.message}` as never);
      setErrors(next);
      return;
    }
    if (parsed.data.endDate < today) {
      setErrors({ endDate: t("errors.endInPast") });
      return;
    }
    if (isPromotionCodeTaken(others, parsed.data.code, form.id ?? undefined)) {
      setErrors({ code: t("errors.codeTaken") });
      return;
    }
    if (full.length > 0) {
      onNotice({ title: t("fullDiscountTitle"), body: t("fullDiscountBody", { workshops: full.map((r) => workshopName(r.workshopId)).join(", ") }) });
      return;
    }
    if (risks.length > 0) { setConfirming({ id: form.id, input: parsed.data }); return; }
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

  const riskLines = (
    <ul className="grid gap-1">
      {risks.map((r) => <li key={r.workshopId}>{t("overBudgetLine", { workshop: workshopName(r.workshopId), percent: r.percent })}</li>)}
    </ul>
  );

  return (
    <>
      <Dialog open={form !== null} onOpenChange={(o) => { if (!o) { setForm(null); setErrors({}); setFailed(null); setConfirming(null); } }}>
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
              <div className="grid content-start gap-1.5">
                <ImageUploadField id="pr-image" label={t("fieldImage")} value={form.imageUrl} onChange={(url) => set({ imageUrl: url })} uploader={promotionImageUploader} />
                <p className="text-xs text-muted-foreground">{t("imageHint")}</p>
                {errors.imageUrl ? <p role="alert" className="text-xs text-destructive">{errors.imageUrl}</p> : null}
              </div>
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
              <Field id="pr-code" label={t("fieldCode")} hint={t("codeHint")} required error={errors.code}>
                {(p) => <Input {...p} className="font-mono uppercase" value={form.code} maxLength={20} onChange={(e) => set({ code: e.target.value })} autoComplete="off" autoCapitalize="characters" spellCheck={false} />}
              </Field>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("fieldStacking")}</legend>
                {STACKING_MODES.map((mode) => (
                  <label key={mode} className="flex items-start gap-2 text-sm">
                    <input type="radio" name="pr-stacking" value={mode} className="mt-1" checked={form.stacking === mode} onChange={() => set({ stacking: mode })} />
                    <span><span className="font-medium">{t(`stackingOption.${mode}.label`)}</span> <span className="text-muted-foreground">{t(`stackingOption.${mode}.hint`)}</span></span>
                  </label>
                ))}
              </fieldset>
              <fieldset className="grid gap-2">
                <legend className="mb-1 text-sm font-medium">{t("fieldAppliesTo")}</legend>
                {(["ALL", "SELECTED"] as const).map((v) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="pr-applies" value={v} checked={form.appliesTo === v} onChange={() => set({ appliesTo: v })} />
                    {t(v === "ALL" ? "allWorkshops" : "selectedWorkshops")}
                  </label>
                ))}
                {form.appliesTo === "SELECTED" ? (
                  <div className="rounded-lg border" role="group" aria-label={t("fieldWorkshops")}>
                    {/* Headers, so it is clear what the two columns are. */}
                    <div className="grid grid-cols-[1.25rem_1fr_auto] items-center gap-x-3 border-b bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground" aria-hidden>
                      <span />
                      <span>{t("colWorkshopName")}</span>
                      <span className="text-right">{t("colOriginalPrice")}</span>
                    </div>
                    <ul className="grid">
                      {workshops.map((w) => (
                        <li key={w.id} className="border-b last:border-b-0">
                          <label className="grid cursor-pointer grid-cols-[1.25rem_1fr_auto] items-center gap-x-3 px-3 py-2 text-sm hover:bg-muted/30">
                            <input
                              type="checkbox" checked={form.workshopIds.includes(w.id)}
                              aria-label={`${t("colWorkshopName")}: ${pickLocalized(w.title, lang, shop.defaultLocale)}, ${t("colOriginalPrice")}: ${money(w.priceAmount)}`}
                              onChange={(e) => set({ workshopIds: e.target.checked ? [...form.workshopIds, w.id] : form.workshopIds.filter((x) => x !== w.id) })}
                            />
                            <span>{pickLocalized(w.title, lang, shop.defaultLocale)}</span>
                            <span className="text-right tabular-nums text-muted-foreground">{money(w.priceAmount)}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {errors.workshopIds ? <p role="alert" className="text-xs text-destructive">{errors.workshopIds}</p> : null}
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field id="pr-start" label={t("fieldStart")} required error={errors.startDate} hint={renewing ? t("renewHint") : undefined}>
                  {(p) => <DateInput {...p} className={renewing ? "border-amber-500 ring-2 ring-amber-400" : undefined} value={form.startDate} onChange={(day) => set({ startDate: day })} />}
                </Field>
                <Field id="pr-end" label={t("fieldEnd")} required error={errors.endDate}>
                  {(p) => <DateInput {...p} value={form.endDate} onChange={(day) => set({ endDate: day })} />}
                </Field>
              </div>
              {example ? <p className="rounded-lg bg-muted/50 p-3 text-sm">{t("example", example)}</p> : null}
              {full.length > 0 ? (
                <div role="alert" data-testid="full-discount-inline" className="grid gap-1 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="flex items-center gap-2 font-medium"><OctagonX className="size-4 shrink-0" aria-hidden />{t("fullDiscountInlineTitle")}</p>
                  <p>{t("fullDiscountInlineBody")}</p>
                  <ul className="grid gap-1">{full.map((r) => <li key={r.workshopId}>{workshopName(r.workshopId)}</li>)}</ul>
                </div>
              ) : null}
              {risks.length > 0 ? (
                <div role="alert" data-testid="over-budget-inline" className="grid gap-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                  <p className="flex items-center gap-2 font-medium"><TriangleAlert className="size-4 shrink-0" aria-hidden />{t("overBudgetTitle")}</p>
                  <p>{t("overBudgetBody", { limit: OVER_BUDGET_PERCENT })}</p>
                  {riskLines}
                </div>
              ) : null}
              <p role="alert" className="min-h-5 text-sm text-destructive">{failed}</p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setForm(null)}>{t("cancel")}</Button>
                <Button type="submit" disabled={save.isPending || !dirty}>{t("save")}</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={confirming !== null} onOpenChange={(o) => { if (!o) setConfirming(null); }}>
        <DialogContent role="alertdialog" data-testid="over-budget-popup">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><TriangleAlert className="size-5 text-amber-700" aria-hidden />{t("overBudgetTitle")}</DialogTitle>
            <DialogDescription>{t("overBudgetBody", { limit: OVER_BUDGET_PERCENT })}</DialogDescription>
          </DialogHeader>
          <div className="text-sm">{riskLines}</div>
          <p className="text-sm text-muted-foreground">{t("overBudgetAdvice")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>{t("overBudgetBack")}</Button>
            <Button onClick={() => { if (confirming) save.mutate(confirming); setConfirming(null); }}>{t("overBudgetSave")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
