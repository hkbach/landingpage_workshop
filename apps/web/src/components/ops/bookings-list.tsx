"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { BOOKING_STATUSES, formatMoney, PAYMENT_STATUSES, pickLocalized, resolveShopLocale, type BookingPriceInfo, type BookingStatus, type Locale, type PaymentStatus } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Booking, Customer, Session, Workshop } from "@/lib/types";
import { dayKey, formatDateTime } from "@/lib/format";
import { dayStatsOf } from "@/lib/bookings-chart";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { BookingStatusBadge, PaymentStatusBadge } from "./status-badges";
import { PriceTip } from "./price-tip";
import { BookingsChart } from "./bookings-chart";
import { addDays } from "./time";
import { ShopLink } from "@/components/dashboard/shell/shop-link";
import { cn } from "@/lib/utils";

/**
 * FR-OPS-01: filter by a range of dates (From - To) / session / workshop / payment status, search by code, name, email. The figures at the top count the bookings of
 * the range by booking status and by payment status; a click on one shows only the bookings of that status (a click on it again, or on All bookings, shows them all).
 * The chart shows the bookings of the same range over time.
 */
export function BookingsList({
  bookings, prices, currency, sessions, customers, workshops, timezone, defaultLocale, enabledLocales, nowIso,
}: {
  bookings: Booking[]; /** The original price of each booking and its vouchers, by booking id. */ prices: Record<string, BookingPriceInfo>;
  currency: string; sessions: Session[]; customers: Customer[]; workshops: Workshop[];
  timezone: string; defaultLocale: Locale; enabledLocales: Locale[]; nowIso: string;
}) {
  const t = useTranslations("ops");
  const tf = useTranslations("ops.finance");
  const locale = useLocale() as Locale;
  const today = dayKey(nowIso, timezone);
  const [from, setFrom] = useState(() => addDays(today, -30)); // default: a month before and a month after today (shop timezone)
  const [to, setTo] = useState(() => addDays(today, 30));
  const [sessionId, setSessionId] = useState("");
  const [workshopId, setWorkshopId] = useState("");
  const [payment, setPayment] = useState<"" | PaymentStatus>(""); // the select, or a click on a payment figure
  const [status, setStatus] = useState<"" | BookingStatus>(""); // set by a click on a figure of the summary
  const [query, setQuery] = useState("");

  const customerOf = (id: string) => customers.find((c) => c.id === id);
  const displayLocale = resolveShopLocale(locale, enabledLocales, defaultLocale);
  const wsTitle = (id: string) => pickLocalized(workshops.find((w) => w.id === id)?.title, displayLocale, defaultLocale);
  const inRange = (iso: string) => { const d = dayKey(iso, timezone); return (!from || d >= from) && (!to || d <= to); };
  const presets = [{ key: "last3m", days: 90 }, { key: "last6m", days: 182 }, { key: "last1y", days: 365 }] as const;

  const sessionOptions = useMemo(
    () =>
      sessions
        .filter((s) => { const d = dayKey(s.startsAt, timezone); return (!from || d >= from) && (!to || d <= to); })
        .filter((s) => !workshopId || s.workshopId === workshopId)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessions, from, to, workshopId, timezone],
  );

  const q = query.trim().toLowerCase();
  // The bookings of the range, the workshop, the session and the search. The booking status figures also follow the payment status chosen, and the payment
  // figures follow the booking status chosen, so each row of figures can be used while the other one is.
  const base = bookings
    .filter((b) => inRange(b.startsAt))
    .filter((b) => !workshopId || b.workshopId === workshopId)
    .filter((b) => !sessionId || b.sessionId === sessionId)
    .filter((b) => {
      if (!q) return true;
      const c = customerOf(b.customerId);
      return [b.bookingCode, c?.fullName, c?.email].some((v) => v?.toLowerCase().includes(q));
    });
  const byPayment = base.filter((b) => !payment || b.paymentStatus === payment);
  const rows = byPayment.filter((b) => !status || b.status === status).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const guestsOf = (list: Booking[]) => list.reduce((n, b) => n + b.quantity, 0);
  const byStatus = BOOKING_STATUSES.map((s) => { const mine = byPayment.filter((b) => b.status === s); return { status: s, bookings: mine.length, guests: guestsOf(mine) }; });
  const payments = PAYMENT_STATUSES.map((s) => {
    const mine = base.filter((b) => b.paymentStatus === s && (!status || b.status === status));
    return { status: s, bookings: mine.length, guests: guestsOf(mine), amount: mine.reduce((n, b) => n + b.totalAmount, 0) };
  });
  const totals = { bookings: byPayment.length, guests: guestsOf(byPayment) };

  // The chart counts the same bookings as the figures (the range, workshop, session and search; its own view splits them by status or by payment); an empty
  // end of the range is the first or the last day with a booking.
  const days = dayStatsOf(base, timezone);
  const known = bookings.map((b) => dayKey(b.startsAt, timezone)).sort();
  const chartFrom = from || known[0] || today;
  const chartTo = to || known.at(-1) || today;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("bookings.title")}</h1>
        <ShopLink href="/shopowner/bookings/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          {t("bookings.new")}
        </ShopLink>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" onSubmit={(e) => e.preventDefault()}>
            <Field id="f-from" label={t("filters.from")}>
              {(p) => <DateInput {...p} value={from} max={to || undefined} onChange={(day) => { setFrom(day); setSessionId(""); }} />}
            </Field>
            <Field id="f-to" label={t("filters.to")}>
              {(p) => <DateInput {...p} value={to} min={from || undefined} onChange={(day) => { setTo(day); setSessionId(""); }} />}
            </Field>
            <Field id="f-session" label={t("filters.session")}>
              {(p) => (
                <NativeSelect {...p} value={sessionId} onChange={(e) => setSessionId(e.target.value)}
                  options={[
                    { value: "", label: t("filters.allSessions") },
                    ...sessionOptions.map((s) => ({ value: s.id, label: `${formatDateTime(s.startsAt, timezone, locale)} | ${wsTitle(s.workshopId)}` })),
                  ]} />
              )}
            </Field>
            <Field id="f-workshop" label={t("filters.workshop")}>
              {(p) => (
                <NativeSelect {...p} value={workshopId} onChange={(e) => { setWorkshopId(e.target.value); setSessionId(""); }}
                  options={[{ value: "", label: t("filters.allWorkshops") }, ...workshops.map((w) => ({ value: w.id, label: wsTitle(w.id) }))]} />
              )}
            </Field>
            <Field id="f-payment" label={t("filters.payment")}>
              {(p) => (
                <NativeSelect {...p} value={payment} onChange={(e) => setPayment(e.target.value as "" | PaymentStatus)}
                  options={[{ value: "", label: t("filters.allPayments") }, ...PAYMENT_STATUSES.map((s) => ({ value: s, label: t(`paymentStatus.${s}`) }))]} />
              )}
            </Field>
            <Field id="f-q" label={t("filters.search")}>
              {(p) => (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input {...p} type="search" className="h-9 pl-8" placeholder={t("filters.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              )}
            </Field>
          </form>
          {/* Quick ranges, ending today. */}
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t("filters.presets")}>
            {presets.map((r) => (
              <Button
                key={r.key} type="button" size="sm" variant={from === addDays(today, -r.days) && to === today ? "default" : "outline"} data-testid={`preset-${r.key}`}
                onClick={() => { setFrom(addDays(today, -r.days)); setTo(today); setSessionId(""); }}
              >
                {t(`filters.${r.key}`)}
              </Button>
            ))}
            <Button type="button" size="sm" variant={!from && !to ? "default" : "outline"} data-testid="preset-all" onClick={() => { setFrom(""); setTo(""); setSessionId(""); }}>{t("filters.allDates")}</Button>
            <span className="text-xs text-muted-foreground">{t("common.tzNote", { tz: timezone })}</span>
          </div>
        </CardContent>
      </Card>

      {/* The bookings of the range counted by booking status and by payment status. A click on a figure filters the table. */}
      <div data-testid="booking-summary" className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        <div role="group" aria-label={t("bookings.summary")} className="grid flex-[5] grid-cols-2 gap-2 sm:grid-cols-5">
          <SummaryStat testId="summary-total" accent="#64748b" label={t("bookings.summaryTotal")} value={totals.bookings} sub={t("bookings.guestsCount", { count: totals.guests })} active={status === ""} onClick={() => setStatus("")} />
          {byStatus.map((s) => (
            <SummaryStat
              key={s.status} testId={`summary-${s.status}`} accent={STATUS_ACCENT[s.status]} label={t(`bookingStatus.${s.status}`)} value={s.bookings} sub={t("bookings.guestsCount", { count: s.guests })}
              active={status === s.status} onClick={() => setStatus(status === s.status ? "" : s.status)}
            />
          ))}
        </div>
        <div role="group" aria-label={t("bookings.summaryPayment")} className="grid flex-[3] grid-cols-2 gap-2 border-t pt-2 lg:border-l lg:border-t-0 lg:pl-2 lg:pt-0">
          {payments.map((p) => (
            <SummaryStat
              key={p.status} testId={`summary-${p.status}`} accent={p.status === "PAID" ? "#16a34a" : "#94a3b8"} label={t(`paymentStatus.${p.status}`)} value={p.bookings}
              sub={`${t("bookings.guestsCount", { count: p.guests })} · ${formatMoney(p.amount, currency, locale)}`}
              active={payment === p.status} onClick={() => setPayment(payment === p.status ? "" : p.status)}
            />
          ))}
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t("bookings.summaryHint")}</p>

      {/* The bookings over time in the range, by the day of their session. */}
      <BookingsChart days={days} from={chartFrom} to={chartTo} />

      <p className="text-sm text-muted-foreground" role="status">{t("bookings.count", { count: rows.length })}</p>

      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("bookings.empty")}</CardContent></Card>
      ) : (
        <Card>
          <TooltipProvider>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("bookings.code")}</TableHead>
                <TableHead>{t("bookings.guest")}</TableHead>
                <TableHead>{t("bookings.session")}</TableHead>
                <TableHead>{t("common.guestsLabel")}</TableHead>
                <TableHead>{t("bookings.status")}</TableHead>
                <TableHead>{t("bookings.payment")}</TableHead>
                <TableHead>{t("bookings.voucher")}</TableHead>
                <TableHead className="text-right">{t("payment.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => {
                const c = customerOf(b.customerId);
                const price = prices[b.id] ?? { subtotal: b.unitPriceAmount * b.quantity, discounts: [] };
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <ShopLink href={`/shopowner/bookings/${b.id}`} className="font-mono font-medium underline-offset-4 hover:underline">{b.bookingCode}</ShopLink>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{c?.fullName ?? "-"}</div>
                      <div className="text-xs text-muted-foreground">{c?.email ?? t("common.noEmail")}</div>
                    </TableCell>
                    <TableCell>
                      <div>{wsTitle(b.workshopId)}</div>
                      <div className="text-xs text-muted-foreground">{formatDateTime(b.startsAt, timezone, locale)}</div>
                    </TableCell>
                    <TableCell>{b.quantity}</TableCell>
                    <TableCell><BookingStatusBadge status={b.status} /></TableCell>
                    <TableCell><PaymentStatusBadge status={b.paymentStatus} /></TableCell>
                    <TableCell data-testid="booking-voucher">
                      {price.discounts.length ? (
                        <span className="flex flex-wrap gap-1">
                          {price.discounts.map((d) => <Badge key={d.code} variant="outline" className="font-mono">{d.code}</Badge>)}
                        </span>
                      ) : <span className="text-muted-foreground" aria-label={tf("noVoucher")}>—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* Hover or focus the total: the original price and each voucher with what it took off. */}
                      <PriceTip testId="booking-total" text={formatMoney(b.totalAmount, b.currency, locale)} price={price} total={b.totalAmount} money={(n) => formatMoney(n, b.currency, locale)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </TooltipProvider>
        </Card>
      )}
    </div>
  );
}

const STATUS_ACCENT: Record<BookingStatus, string> = { NOT_CONFIRMED: "#f59e0b", CONFIRMED: "#3b82f6", CHECKED_IN: "#10b981", CANCELLED: "#ef4444" };

/**
 * One figure of the summary: how many bookings (big) and how many guests they hold (small, with the amount for the payment figures). It is a button:
 * the figure being shown is highlighted (`aria-pressed`), and a click shows only the bookings of that status.
 */
function SummaryStat({ label, value, sub, testId, accent, active, onClick }: { label: string; value: number; sub: string; testId: string; accent: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" data-testid={testId} aria-pressed={active} onClick={onClick} style={{ borderLeftColor: accent }}
      className={cn("rounded-lg border border-l-4 bg-card px-2.5 py-1.5 text-left outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", active && "border-y-primary border-r-primary bg-primary/5 ring-2 ring-primary/30")}
    >
      <span className="block truncate text-[11px] text-muted-foreground">{label}</span>
      <span className="block text-lg font-semibold leading-tight tabular-nums" data-testid={`${testId}-count`}>{value}</span>
      <span className="block text-[11px] leading-tight text-muted-foreground">{sub}</span>
    </button>
  );
}
