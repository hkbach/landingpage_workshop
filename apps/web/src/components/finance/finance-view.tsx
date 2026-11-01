"use client";

import { useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pencil, Plus, Trash2 } from "lucide-react";
import {
  byCategory, EXPENSE_CATEGORIES, filterEntries, financeEntrySchema, FINANCE_NOTE_MAX, FINANCE_TYPES, formatMoney, INCOME_CATEGORIES,
  lastMonthKeys, manualCategories, minorDigits, monthlySeries, summarize, type FinanceCategory, type FinanceEntry, type FinanceType,
} from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { Field } from "@/components/ops/field";
import { dayKey, formatDate } from "@/lib/format";
import { newUuid } from "@/lib/uuid";
import { cn } from "@/lib/utils";
import { CategoryBars, EXPENSE_COLOR, INCOME_COLOR, MonthlyChart } from "./charts";
import { addEntry, loadManualEntries, parseAmount, removeEntry, saveManualEntries, updateEntry } from "./finance-store";

const PERIODS = [3, 6, 12] as const;
type Period = (typeof PERIODS)[number];
const noop = () => () => {};

interface Props {
  /** Entries derived from the booking payments (read-only). */
  derived: FinanceEntry[];
  /** The manual entries a shop starts with (mock data). */
  seed: FinanceEntry[];
  currency: string;
  timezone: string;
}

/** Gate: the manual entries are kept in localStorage for now, which is only read after hydration. */
export function FinanceView(props: Props) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const t = useTranslations("ops.finance");
  if (!hydrated) return <p className="text-sm text-muted-foreground" aria-busy>{t("loading")}</p>;
  return <FinanceInner {...props} />;
}

type FormState = { id: string | null; type: FinanceType; category: string; amount: string; date: string; note: string };

function FinanceInner({ derived, seed, currency, timezone }: Props) {
  const t = useTranslations("ops.finance");
  const locale = useLocale();
  const digits = minorDigits(currency);
  const money = (n: number) => formatMoney(n, currency, locale);
  const [manual, setManual] = useState<FinanceEntry[]>(() => loadManualEntries(seed, currency));
  const [period, setPeriod] = useState<Period>(6);
  const [typeFilter, setTypeFilter] = useState<"" | FinanceType>("");
  const [categoryFilter, setCategoryFilter] = useState<"" | FinanceCategory>("");
  const [form, setForm] = useState<FormState | null>(null);
  const [deleting, setDeleting] = useState<FinanceEntry | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [now] = useState(() => new Date());

  const all = useMemo(() => [...derived, ...manual], [derived, manual]);
  const months = useMemo(() => lastMonthKeys(now, timezone, period), [now, timezone, period]);
  const inPeriod = useMemo(() => filterEntries(all, { months }, timezone), [all, months, timezone]);
  const totals = summarize(inPeriod);
  const series = useMemo(() => monthlySeries(all, timezone, months), [all, timezone, months]);
  const expenseShares = byCategory(inPeriod, "EXPENSE");
  const incomeShares = byCategory(inPeriod, "INCOME");
  const rows = useMemo(
    () => filterEntries(all, { months, ...(typeFilter ? { type: typeFilter } : {}), ...(categoryFilter ? { category: categoryFilter } : {}) }, timezone),
    [all, months, typeFilter, categoryFilter, timezone],
  );
  const categoryOptions = typeFilter === "INCOME" ? INCOME_CATEGORIES : typeFilter === "EXPENSE" ? EXPENSE_CATEGORIES : [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES];
  const catLabel = (c: FinanceCategory) => t(`categories.${c}`);
  const monthLabel = (key: string) => new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`));

  function persist(next: FinanceEntry[], okText: string) {
    if (!saveManualEntries(next)) { setMessage({ text: t("saveFailed"), tone: "error" }); return false; }
    setManual(next);
    setMessage({ text: okText, tone: "ok" });
    return true;
  }
  function openNew() {
    setMessage(null);
    setForm({ id: null, type: "EXPENSE", category: "MATERIALS", amount: "", date: dayKey(now.toISOString(), timezone), note: "" });
  }
  function openEdit(e: FinanceEntry) {
    setMessage(null);
    setForm({ id: e.id, type: e.type, category: e.category, amount: String(e.amount / 10 ** digits), date: e.occurredAt.slice(0, 10), note: e.note ?? "" });
  }

  return (
    <div className="grid gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button onClick={openNew}><Plus aria-hidden />{t("add")}</Button>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="fin-period">{t("period")}</Label>
          <NativeSelect id="fin-period" value={period} onChange={(e) => setPeriod(Number(e.target.value) as Period)}>
            {PERIODS.map((p) => <option key={p} value={p}>{t("lastMonths", { count: p })}</option>)}
          </NativeSelect>
        </div>
        <p role="status" className={cn("min-h-5 text-sm font-medium", message?.tone === "error" ? "text-destructive" : "text-emerald-800")}>{message?.text}</p>
      </div>

      <ul className="grid gap-3 sm:grid-cols-3" aria-label={t("summary")}>
        <SummaryCard label={t("income")} value={money(totals.income)} accent={INCOME_COLOR} />
        <SummaryCard label={t("expense")} value={money(totals.expense)} accent={EXPENSE_COLOR} />
        <SummaryCard
          label={totals.net < 0 ? t("loss") : t("profit")} value={money(totals.net)} accent="#1f2937"
          note={totals.net < 0 ? t("lossNote") : totals.net > 0 ? t("profitNote") : undefined}
        />
      </ul>

      <Card>
        <CardHeader><CardTitle>{t("monthlyTitle")}</CardTitle></CardHeader>
        <CardContent>
          <MonthlyChart
            series={series} currency={currency} locale={locale}
            labels={{
              title: t("showTable"), income: t("income"), expense: t("expense"), net: t("net"), month: t("month"), format: money, monthLabel,
              summary: t("chartSummary", { from: monthLabel(months[0]!), to: monthLabel(months[months.length - 1]!), income: money(totals.income), expense: money(totals.expense), net: money(totals.net) }),
            }}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("expenseByCategory")}</CardTitle></CardHeader>
          <CardContent>
            {expenseShares.length ? <CategoryBars items={expenseShares} color={EXPENSE_COLOR} label={catLabel} format={money} percent={(s) => `${Math.round(s * 100)}%`} /> : <p className="text-sm text-muted-foreground">{t("noData")}</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("incomeByCategory")}</CardTitle></CardHeader>
          <CardContent>
            {incomeShares.length ? <CategoryBars items={incomeShares} color={INCOME_COLOR} label={catLabel} format={money} percent={(s) => `${Math.round(s * 100)}%`} /> : <p className="text-sm text-muted-foreground">{t("noData")}</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("entries")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="fin-type">{t("typeFilter")}</Label>
              <NativeSelect id="fin-type" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value as "" | FinanceType); setCategoryFilter(""); }}>
                <option value="">{t("allTypes")}</option>
                {FINANCE_TYPES.map((x) => <option key={x} value={x}>{t(`type.${x}`)}</option>)}
              </NativeSelect>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fin-cat">{t("categoryFilter")}</Label>
              <NativeSelect id="fin-cat" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as "" | FinanceCategory)}>
                <option value="">{t("allCategories")}</option>
                {categoryOptions.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </NativeSelect>
            </div>
          </div>
          {rows.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("date")}</TableHead><TableHead>{t("typeLabel")}</TableHead><TableHead>{t("category")}</TableHead>
                    <TableHead>{t("note")}</TableHead><TableHead className="text-right">{t("amount")}</TableHead><TableHead><span className="sr-only">{t("actions")}</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{formatDate(e.occurredAt, timezone, locale)}</TableCell>
                      <TableCell>
                        <Badge className={e.type === "INCOME" ? "bg-blue-100 text-blue-950" : "bg-orange-100 text-orange-950"}>{t(`type.${e.type}`)}</Badge>
                      </TableCell>
                      <TableCell>{catLabel(e.category)}</TableCell>
                      <TableCell className="max-w-64 truncate">{e.source === "BOOKING" ? `${t("fromBookings")} · ${e.note ?? ""}` : e.note}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.type === "EXPENSE" ? "−" : "+"}{money(e.amount)}</TableCell>
                      <TableCell className="whitespace-nowrap text-right">
                        {e.source === "MANUAL" ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => openEdit(e)}><Pencil aria-hidden />{t("edit")}<span className="sr-only">: {e.note ?? catLabel(e.category)}</span></Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleting(e)}><Trash2 aria-hidden />{t("delete")}<span className="sr-only">: {e.note ?? catLabel(e.category)}</span></Button>
                          </>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <EntryDialog
        form={form} setForm={setForm} digits={digits} currency={currency}
        onSave={(input, id) => {
          const next = id ? updateEntry(manual, id, input, currency) : addEntry(manual, input, { id: `fe-${newUuid().slice(0, 8)}`, currency });
          if (persist(next, t(id ? "updated" : "added"))) setForm(null);
        }}
      />

      <Dialog open={deleting !== null} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>{deleting ? t("deleteBody", { type: t(`type.${deleting.type}`).toLowerCase(), amount: money(deleting.amount), date: formatDate(deleting.occurredAt, timezone, locale) }) : ""}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={() => { if (deleting) persist(removeEntry(manual, deleting.id), t("deleted")); setDeleting(null); }}>{t("deleteConfirm")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SummaryCard({ label, value, accent, note }: { label: string; value: string; accent: string; note?: string }) {
  return (
    <li>
      <Card className="h-full">
        <CardContent className="grid gap-1" style={{ borderLeft: `4px solid ${accent}` }}>
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="text-2xl font-semibold tabular-nums">{value}</span>
          {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
        </CardContent>
      </Card>
    </li>
  );
}

function EntryDialog({ form, setForm, digits, currency, onSave }: {
  form: FormState | null; setForm: (f: FormState | null) => void; digits: number; currency: string;
  onSave: (input: { type: FinanceType; category: string; amount: number; date: string; note?: string }, id: string | null) => void;
}) {
  const t = useTranslations("ops.finance");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (patch: Partial<FormState>) => { if (form) { setForm({ ...form, ...patch }); setErrors({}); } };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    const amount = parseAmount(form.amount, digits);
    const parsed = financeEntrySchema.safeParse({ type: form.type, category: form.category, amount: amount ?? 0, date: form.date, note: form.note || undefined });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const i of parsed.error.issues) next[String(i.path[0])] ??= t(`errors.${i.message}` as never);
      setErrors(next);
      return;
    }
    onSave(parsed.data, form.id);
  }

  return (
    <Dialog open={form !== null} onOpenChange={(o) => { if (!o) { setForm(null); setErrors({}); } }}>
      <DialogContent>
        {form ? (
          <form onSubmit={submit} className="grid gap-4" noValidate>
            <DialogHeader>
              <DialogTitle>{form.id ? t("editTitle") : t("addTitle")}</DialogTitle>
              <DialogDescription>{t("formHint")}</DialogDescription>
            </DialogHeader>
            <Field id="fe-type" label={t("typeLabel")} required>
              {(p) => (
                <NativeSelect {...p} value={form.type} onChange={(e) => { const type = e.target.value as FinanceType; set({ type, category: manualCategories(type)[0]! }); }}>
                  {FINANCE_TYPES.map((x) => <option key={x} value={x}>{t(`type.${x}`)}</option>)}
                </NativeSelect>
              )}
            </Field>
            <Field id="fe-category" label={t("category")} required error={errors.category}>
              {(p) => (
                <NativeSelect {...p} value={form.category} onChange={(e) => set({ category: e.target.value })}>
                  {manualCategories(form.type).map((c) => <option key={c} value={c}>{t(`categories.${c}`)}</option>)}
                </NativeSelect>
              )}
            </Field>
            <Field id="fe-amount" label={`${t("amount")} (${currency})`} required error={errors.amount}>
              {(p) => <Input {...p} inputMode="decimal" value={form.amount} onChange={(e) => set({ amount: e.target.value })} autoComplete="off" />}
            </Field>
            <Field id="fe-date" label={t("date")} required error={errors.date}>
              {(p) => <Input {...p} type="date" value={form.date} onChange={(e) => set({ date: e.target.value })} />}
            </Field>
            <Field id="fe-note" label={t("note")} error={errors.note}>
              {(p) => <Input {...p} value={form.note} maxLength={FINANCE_NOTE_MAX + 20} onChange={(e) => set({ note: e.target.value })} autoComplete="off" />}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setForm(null)}>{t("cancel")}</Button>
              <Button type="submit">{t("save")}</Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
