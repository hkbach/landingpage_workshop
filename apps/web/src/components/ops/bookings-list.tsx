"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { BOOKING_STATUSES, formatMoney, pickLocalized, resolveShopLocale, type BookingPriceInfo, type BookingStatus, type Locale } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Booking, Customer, Session, Workshop } from "@/lib/types";
import { dayKey, formatDateTime } from "@/lib/format";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { BookingStatusBadge, PaymentStatusBadge } from "./status-badges";
import { PriceTip } from "./price-tip";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/** FR-OPS-01: filter by date / session / status, search by code, name, email. */
export function BookingsList({
  bookings, prices, sessions, customers, workshops, timezone, defaultLocale, enabledLocales, nowIso,
}: {
  bookings: Booking[]; /** The original price of each booking and its vouchers, by booking id. */ prices: Record<string, BookingPriceInfo>; sessions: Session[]; customers: Customer[]; workshops: Workshop[];
  timezone: string; defaultLocale: Locale; enabledLocales: Locale[]; nowIso: string;
}) {
  const t = useTranslations("ops");
  const tf = useTranslations("ops.finance");
  const locale = useLocale() as Locale;
  const [date, setDate] = useState(() => dayKey(nowIso, timezone)); // default: today (shop timezone)
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<"" | BookingStatus>("");
  const [query, setQuery] = useState("");

  const customerOf = (id: string) => customers.find((c) => c.id === id);
  const displayLocale = resolveShopLocale(locale, enabledLocales, defaultLocale);
  const wsTitle = (id: string) => pickLocalized(workshops.find((w) => w.id === id)?.title, displayLocale, defaultLocale);

  const sessionOptions = useMemo(
    () =>
      sessions
        .filter((s) => !date || dayKey(s.startsAt, timezone) === date)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    [sessions, date, timezone],
  );

  const q = query.trim().toLowerCase();
  // The bookings the date, the session and the search let through; the summary counts them by status, and the status filter then narrows the table.
  const inScope = bookings
    .filter((b) => (!date || dayKey(b.startsAt, timezone) === date))
    .filter((b) => !sessionId || b.sessionId === sessionId)
    .filter((b) => {
      if (!q) return true;
      const c = customerOf(b.customerId);
      return [b.bookingCode, c?.fullName, c?.email].some((v) => v?.toLowerCase().includes(q));
    });
  const rows = inScope.filter((b) => !status || b.status === status).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const byStatus = BOOKING_STATUSES.map((s) => {
    const mine = inScope.filter((b) => b.status === s);
    return { status: s, bookings: mine.length, guests: mine.reduce((n, b) => n + b.quantity, 0) };
  });
  const totals = { bookings: inScope.length, guests: inScope.reduce((n, b) => n + b.quantity, 0) };

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
        <CardContent>
          <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
            <Field id="f-date" label={t("filters.date")} hint={t("common.tzNote", { tz: timezone })}>
              {(p) => (
                <div className="flex gap-2">
                  <DateInput {...p} value={date} onChange={(day) => { setDate(day); setSessionId(""); }} />
                  <Button type="button" variant="outline" disabled={!date} onClick={() => { setDate(""); setSessionId(""); }}>
                    {t("filters.allDates")}
                  </Button>
                </div>
              )}
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
            <Field id="f-status" label={t("filters.status")}>
              {(p) => (
                <NativeSelect {...p} value={status} onChange={(e) => setStatus(e.target.value as "" | BookingStatus)}
                  options={[{ value: "", label: t("filters.allStatuses") }, ...BOOKING_STATUSES.map((s) => ({ value: s, label: t(`bookingStatus.${s}`) }))]} />
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
        </CardContent>
      </Card>

      {/* The bookings of the date, session and search chosen above, counted by booking status. */}
      <dl aria-label={t("bookings.summary")} data-testid="booking-summary" className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <SummaryStat testId="summary-total" label={t("bookings.summaryTotal")} value={totals.bookings} guests={t("bookings.guestsCount", { count: totals.guests })} />
        {byStatus.map((s) => (
          <SummaryStat key={s.status} testId={`summary-${s.status}`} label={t(`bookingStatus.${s.status}`)} value={s.bookings} guests={t("bookings.guestsCount", { count: s.guests })} />
        ))}
      </dl>

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

/** One figure of the summary: how many bookings (big) and how many guests they hold (small), like the figures of the Today screen. */
function SummaryStat({ label, value, guests, testId }: { label: string; value: number; guests: string; testId: string }) {
  return (
    <div className="rounded-lg border bg-card p-3" data-testid={testId}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold" data-testid={`${testId}-count`}>{value}</dd>
      <dd className="text-xs text-muted-foreground">{guests}</dd>
    </div>
  );
}
