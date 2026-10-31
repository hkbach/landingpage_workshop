"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Plus, Search } from "lucide-react";
import { BOOKING_STATUSES, formatMoney, pickLocalized, resolveShopLocale, type BookingStatus, type Locale } from "@workshop/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Booking, Customer, Session, Workshop } from "@/lib/types";
import { dayKey, formatDateTime } from "@/lib/format";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { BookingStatusBadge, PaymentStatusBadge } from "./status-badges";

/** FR-OPS-01: filter by date / session / status, search by code, name, email. */
export function BookingsList({
  bookings, sessions, customers, workshops, timezone, defaultLocale, enabledLocales, nowIso,
}: {
  bookings: Booking[]; sessions: Session[]; customers: Customer[]; workshops: Workshop[];
  timezone: string; defaultLocale: Locale; enabledLocales: Locale[]; nowIso: string;
}) {
  const t = useTranslations("ops");
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
  const rows = bookings
    .filter((b) => (!date || dayKey(b.startsAt, timezone) === date))
    .filter((b) => !sessionId || b.sessionId === sessionId)
    .filter((b) => !status || b.status === status)
    .filter((b) => {
      if (!q) return true;
      const c = customerOf(b.customerId);
      return [b.bookingCode, c?.fullName, c?.email].some((v) => v?.toLowerCase().includes(q));
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("bookings.title")}</h1>
        <Link href="/dashboard/bookings/new" className={buttonVariants()}>
          <Plus aria-hidden="true" />
          {t("bookings.new")}
        </Link>
      </div>

      <Card>
        <CardContent>
          <form role="search" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
            <Field id="f-date" label={t("filters.date")} hint={t("common.tzNote", { tz: timezone })}>
              {(p) => (
                <div className="flex gap-2">
                  <Input {...p} type="date" value={date} onChange={(e) => { setDate(e.target.value); setSessionId(""); }} />
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

      <p className="text-sm text-muted-foreground" role="status">{t("bookings.count", { count: rows.length })}</p>

      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("bookings.empty")}</CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("bookings.code")}</TableHead>
                <TableHead>{t("bookings.guest")}</TableHead>
                <TableHead>{t("bookings.session")}</TableHead>
                <TableHead>{t("common.guestsLabel")}</TableHead>
                <TableHead>{t("bookings.status")}</TableHead>
                <TableHead>{t("bookings.payment")}</TableHead>
                <TableHead className="text-right">{t("payment.total")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((b) => {
                const c = customerOf(b.customerId);
                return (
                  <TableRow key={b.id}>
                    <TableCell>
                      <Link href={`/dashboard/bookings/${b.id}`} className="font-mono font-medium underline-offset-4 hover:underline">{b.bookingCode}</Link>
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
                    <TableCell className="text-right">{formatMoney(b.totalAmount, b.currency, locale)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
