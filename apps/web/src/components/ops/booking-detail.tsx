"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { formatMoney, type BookingStatus, type Locale } from "@workshop/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Booking, Customer, Session } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { netPaid } from "@/lib/booking-state";
import { BookingActions } from "./booking-actions";
import { BookingStatusBadge, PaymentStatusBadge } from "./status-badges";
import { useOpsState, type BookingEvent } from "./use-ops-state";

/** Statuses already passed when the booking was loaded (mock data has no history; times unknown). */
function initialTrail(status: BookingStatus, createdAt: string): BookingEvent[] {
  const trail: BookingEvent[] = [{ status: "CONFIRMED", at: createdAt }];
  if (status === "CHECKED_IN" || status === "COMPLETED") trail.push({ status: "CHECKED_IN" });
  if (status === "COMPLETED") trail.push({ status: "COMPLETED" });
  if (status === "LATE_RELEASED" || status === "NO_SHOW" || status === "CANCELLED") trail.push({ status });
  return trail;
}

/** FR-OPS-01/03..08 + FR-PAY-01 detail: summary, status timeline, actions and append-only payment entries. */
export function BookingDetail({
  booking, customer, sessions, nowIso, actor,
}: { booking: Booking; customer?: Customer; sessions: Session[]; nowIso: string; actor: string }) {
  const t = useTranslations("ops");
  const locale = useLocale() as Locale;
  const ops = useOpsState({ bookings: [booking], sessions, nowIso, actor });
  const [trail0] = useState(() => initialTrail(booking.status, booking.createdAt));
  const b = ops.bookings[0] ?? booking;
  const session = ops.sessions.find((s) => s.id === b.sessionId);
  const trail = [...trail0, ...(ops.history[b.id] ?? [])];
  const net = netPaid(b.payments);
  const fmt = (n: number) => formatMoney(n, b.currency, locale);

  return (
    <div className="grid gap-4">
      <div>
        <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden="true" />
          {t("bookings.title")}
        </Link>
      </div>
      <header className="flex flex-wrap items-center gap-2">
        <h1 className="font-mono text-xl font-semibold sm:text-2xl">{b.bookingCode}</h1>
        <BookingStatusBadge status={b.status} />
        <PaymentStatusBadge status={b.paymentStatus} />
      </header>
      <p className="text-xs text-muted-foreground">{t("detail.independentNote")}</p>

      {session ? (
        <Card>
          <CardHeader><CardTitle>{t("detail.actions")}</CardTitle></CardHeader>
          <CardContent>
            <BookingActions booking={b} session={session} ops={ops} timezone={b.timezone} showReschedule />
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("detail.summary")}</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <Row label={t("bookings.workshop")}>{b.workshopTitle}</Row>
              <Row label={t("bookings.session")}>
                {formatDateTime(b.startsAt, b.timezone, locale)} <span className="text-xs text-muted-foreground">({b.timezone})</span>
              </Row>
              <Row label={t("common.guestsLabel")}>{b.quantity}</Row>
              <Row label={t("detail.unitPrice")}>{fmt(b.unitPriceAmount)}</Row>
              <Row label={t("payment.total")}>{fmt(b.totalAmount)}</Row>
              <Row label={t("detail.source")}>{t(`source.${b.source}`)}</Row>
              <Row label={t("detail.created")}>{formatDateTime(b.createdAt, b.timezone, locale)}</Row>
              {b.specialRequest ? <Row label={t("common.request")}>{b.specialRequest}</Row> : null}
              {b.cancelReason ? <Row label={t("detail.cancelReason")}>{b.cancelReason}</Row> : null}
            </dl>
            <p className="mt-3 text-xs text-muted-foreground">{t("detail.snapshotNote")}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t("detail.customer")}</CardTitle></CardHeader>
          <CardContent>
            {customer ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <Row label={t("customers.name")}>
                  <Link href={`/dashboard/customers/${customer.id}`} className="font-medium underline-offset-4 hover:underline">{customer.fullName}</Link>
                </Row>
                <Row label={t("customers.email")}>{customer.email ?? t("common.noEmail")}</Row>
                <Row label={t("customers.phone")}>{customer.phone ?? "-"}</Row>
                <Row label={t("customers.country")}>{customer.country}</Row>
              </dl>
            ) : <p className="text-sm text-muted-foreground">-</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("detail.timeline")}</CardTitle></CardHeader>
        <CardContent>
          <ol className="grid gap-3">
            {trail.map((ev, i) => (
              <li key={`${ev.status}-${i}`} className="flex flex-wrap items-center gap-2 text-sm">
                <span aria-hidden="true" className="size-2 rounded-full bg-primary" />
                <BookingStatusBadge status={ev.status} />
                <span className="text-muted-foreground">{ev.at ? formatDateTime(ev.at, b.timezone, locale) : t("detail.timeUnknown")}</span>
                {ev.note ? <span className="text-xs italic text-muted-foreground">{ev.note}</span> : null}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("payment.entries")}</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <dl className="grid grid-cols-3 gap-2 text-sm sm:max-w-md">
            <div><dt className="text-xs text-muted-foreground">{t("payment.total")}</dt><dd className="font-medium">{fmt(b.totalAmount)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("payment.netPaid")}</dt><dd className="font-medium">{fmt(net)}</dd></div>
            <div><dt className="text-xs text-muted-foreground">{t("payment.balance")}</dt><dd className="font-medium">{fmt(Math.max(0, b.totalAmount - net))}</dd></div>
          </dl>
          {b.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("payment.none")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("payment.when")}</TableHead>
                  <TableHead>{t("payment.type")}</TableHead>
                  <TableHead>{t("payment.method")}</TableHead>
                  <TableHead>{t("payment.note")}</TableHead>
                  <TableHead>{t("payment.by")}</TableHead>
                  <TableHead className="text-right">{t("payment.amountCol")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {b.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{formatDateTime(p.recordedAt, b.timezone, locale)}</TableCell>
                    <TableCell>{t(`payment.type${p.type}`)}</TableCell>
                    <TableCell>{t(`paymentMethod.${p.method}`)}</TableCell>
                    <TableCell>{p.note ?? "-"}</TableCell>
                    <TableCell>{p.recordedBy}</TableCell>
                    <TableCell className={`text-right ${p.type === "REFUND" ? "text-red-800" : ""}`}>
                      {p.type === "REFUND" ? "-" : ""}{fmt(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground">{t("payment.immutable")}</p>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}
