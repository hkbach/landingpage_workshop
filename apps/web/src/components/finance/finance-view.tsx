"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  addDaysToKey, checkDateRange, dayKeyOf, feeShares, filterLedgerRange, formatMoney, ledgerSeries, MAX_RANGE_DAYS, summarizeLedger, type FeeKind, type FeeRates, type LedgerRow,
} from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CategoryBars, EXPENSE_COLOR, INCOME_COLOR, MonthlyChart } from "./charts";

/** The range shown when the page opens: the last 180 days (about six months), today included. */
const DEFAULT_RANGE_DAYS = 180;

interface Props {
  /** Every payment and refund of the bookings with the fees taken from it (see `ledgerFromPayments`). */
  rows: LedgerRow[];
  /** The platform rates the rows were computed with. */
  rates: FeeRates;
  currency: string;
  timezone: string;
}

/**
 * Income of the shop: Profit = total income - maintenance fee - service fee. The income is what the bookings paid (minus refunds), the two fees
 * are percentages set by the platform administrator.
 */
export function FinanceView({ rows, rates, currency, timezone }: Props) {
  const t = useTranslations("ops.finance");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, currency, locale);
  const rate = (bps: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
  /** A signed amount for the table: "+" adds to the shop, "−" takes from it. */
  const signed = (n: number) => (n < 0 ? `−${money(-n)}` : `+${money(n)}`);
  const [kind, setKind] = useState<"" | LedgerRow["kind"]>("");
  const [now] = useState(() => new Date());
  // The range of days shown: what is typed, and the last range that was valid (the page keeps showing it while the typed one is wrong).
  const today = dayKeyOf(now.toISOString(), timezone);
  const first = addDaysToKey(today, -(DEFAULT_RANGE_DAYS - 1));
  const [typed, setTyped] = useState({ from: first, to: today });
  const [range, setRange] = useState({ from: first, to: today });
  const check = checkDateRange(typed.from, typed.to);
  function change(next: { from: string; to: string }) {
    setTyped(next);
    if (checkDateRange(next.from, next.to) === "OK") setRange(next);
  }

  const inRange = useMemo(() => filterLedgerRange(rows, range.from, range.to, timezone), [rows, range, timezone]);
  const totals = summarizeLedger(inRange);
  const chart = useMemo(() => ledgerSeries(rows, timezone, range.from, range.to), [rows, range, timezone]);
  const shown = useMemo(() => filterLedgerRange(rows, range.from, range.to, timezone, kind || undefined), [rows, range, timezone, kind]);
  const monthLabel = (key: string) => key.length === 7
    ? new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${key}-15T12:00:00Z`))
    : new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
  const dayLabel = (key: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
  const rangeError = check === "OK" ? null : check === "REQUIRED" ? t("rangeRequired") : check === "ORDER" ? t("rangeOrder") : check === "TOO_LONG" ? t("rangeTooLong", { max: MAX_RANGE_DAYS }) : t("rangeInvalid");
  const maintenance = rate(rates.maintenanceBps);
  const service = rate(rates.serviceBps);
  const feeLabel = (k: FeeKind) => (k === "MAINTENANCE" ? t("maintenanceFee", { rate: maintenance }) : t("serviceFee", { rate: service }));

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      </header>

      <p data-testid="fee-formula" className="rounded-lg bg-muted/50 p-3 text-sm">
        <strong className="font-medium">{t("formulaTitle")}:</strong> {t("formula", { maintenance, service })}
        <span className="mt-1 block text-xs text-muted-foreground">{t("ratesNote")}</span>
      </p>

      <div className="grid gap-1.5">
        <div className="grid max-w-md grid-cols-2 gap-3" role="group" aria-label={t("range")}>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="fin-from">{t("from")}</Label>
            <Input id="fin-from" type="date" max={today} value={typed.from} aria-invalid={rangeError ? true : undefined} aria-describedby="fin-range-note" onChange={(e) => change({ ...typed, from: e.target.value })} />
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor="fin-to">{t("to")}</Label>
            <Input id="fin-to" type="date" max={today} value={typed.to} aria-invalid={rangeError ? true : undefined} aria-describedby="fin-range-note" onChange={(e) => change({ ...typed, to: e.target.value })} />
          </div>
        </div>
        <p id="fin-range-note" className="text-xs text-muted-foreground">{t("rangeHint", { max: MAX_RANGE_DAYS })}</p>
        {rangeError ? <p role="alert" data-testid="range-error" className="text-sm font-medium text-destructive">{rangeError}</p> : null}
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("summary")}>
        <SummaryCard testId="total-income" label={t("income")} value={money(totals.income)} accent={INCOME_COLOR} note={t("incomeNote")} />
        <SummaryCard testId="maintenance-fee" label={t("maintenanceFee", { rate: maintenance })} value={`−${money(totals.maintenanceFee)}`} accent={EXPENSE_COLOR} />
        <SummaryCard testId="service-fee" label={t("serviceFee", { rate: service })} value={`−${money(totals.serviceFee)}`} accent={EXPENSE_COLOR} />
        <SummaryCard
          testId="profit" label={totals.profit < 0 ? t("loss") : t("profit")} value={money(totals.profit)} accent="#1f2937"
          note={t("profitNote")} negative={totals.profit < 0}
        />
      </ul>

      <Card>
        <CardHeader><CardTitle>{t("monthlyTitle")}</CardTitle></CardHeader>
        <CardContent>
          <MonthlyChart
            series={chart.points} currency={currency} locale={locale}
            labels={{
              title: t("showTable"), income: t("income"), expense: t("fees"), net: t("profit"), month: chart.unit === "day" ? t("date") : t("month"), format: money, monthLabel,
              summary: t("chartSummary", { from: dayLabel(range.from), to: dayLabel(range.to), income: money(totals.income), fees: money(totals.fees), profit: money(totals.profit) }),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("feesByKind")}</CardTitle></CardHeader>
        <CardContent>
          {feeShares(totals).length ? (
            <CategoryBars items={feeShares(totals)} color={EXPENSE_COLOR} label={feeLabel} format={money} percent={(s) => `${Math.round(s * 100)}%`} />
          ) : <p className="text-sm text-muted-foreground">{t("noData")}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("entries")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid content-start gap-1.5 sm:w-56">
            <Label htmlFor="fin-kind">{t("typeFilter")}</Label>
            <NativeSelect id="fin-kind" value={kind} onChange={(e) => setKind(e.target.value as "" | LedgerRow["kind"])}>
              <option value="">{t("allTypes")}</option>
              <option value="PAYMENT">{t("kind.PAYMENT")}</option>
              <option value="REFUND">{t("kind.REFUND")}</option>
            </NativeSelect>
          </div>
          {shown.length === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table data-testid="ledger-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("date")}</TableHead><TableHead>{t("booking")}</TableHead><TableHead>{t("typeLabel")}</TableHead>
                    <TableHead>{t("vouchers")}</TableHead>
                    <TableHead className="text-right">{t("amount")}</TableHead><TableHead className="text-right">{t("maintenanceFee", { rate: maintenance })}</TableHead>
                    <TableHead className="text-right">{t("serviceFee", { rate: service })}</TableHead><TableHead className="text-right">{t("profit")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((r) => (
                    <TableRow key={r.id} data-testid="ledger-row">
                      <TableCell className="whitespace-nowrap">{formatDate(r.occurredAt, timezone, locale)}</TableCell>
                      <TableCell className="font-mono">{r.bookingCode}</TableCell>
                      <TableCell>
                        <Badge className={r.kind === "PAYMENT" ? "bg-blue-100 text-blue-950" : "bg-orange-100 text-orange-950"}>{t(`kind.${r.kind}`)}</Badge>
                      </TableCell>
                      <TableCell data-testid="ledger-vouchers">
                        {r.vouchers.length ? (
                          <span className="flex flex-wrap gap-1">
                            {r.vouchers.map((v) => <Badge key={v} variant="outline" className="font-mono">{v}</Badge>)}
                          </span>
                        ) : <span className="text-muted-foreground" aria-label={t("noVoucher")}>—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{signed(r.amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{signed(-r.maintenanceFee)}</TableCell>
                      <TableCell className="text-right tabular-nums">{signed(-r.serviceFee)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{signed(r.profit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, accent, note, negative, testId }: { label: string; value: string; accent: string; note?: string; negative?: boolean; testId: string }) {
  return (
    <li>
      <Card className="h-full">
        <CardContent className="grid gap-1" style={{ borderLeft: `4px solid ${accent}` }}>
          <span className="text-sm text-muted-foreground">{label}</span>
          <span data-testid={testId} className={cn("text-2xl font-semibold tabular-nums", negative && "text-destructive")}>{value}</span>
          {note ? <span className="text-xs text-muted-foreground">{note}</span> : null}
        </CardContent>
      </Card>
    </li>
  );
}
