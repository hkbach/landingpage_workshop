"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { CheckCheck, Clock, Users } from "lucide-react";
import { formatMoney, pickLocalized, resolveShopLocale, type Locale } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Booking, Customer, Session, Workshop } from "@/lib/types";
import { dayKey, formatTime } from "@/lib/format";
import { holdsSeat, netPaid } from "@/lib/booking-state";
import { BookingActions } from "./booking-actions";
import { CapacityBar } from "./capacity-bar";
import { BookingStatusBadge, PaymentStatusBadge, SessionStatusBadge } from "./status-badges";
import { formatDayKey } from "./time";
import { useOpsState } from "./use-ops-state";

export interface ShopCtx { timezone: string; currency: string; defaultLocale: Locale; enabledLocales: Locale[]; ownerName: string }

/** FR-OPS-01 "Today": sessions of the day with a tap-friendly guest list and quick actions. */
export function TodayView({
  bookings, sessions, customers, workshops, shop, nowIso,
}: { bookings: Booking[]; sessions: Session[]; customers: Customer[]; workshops: Workshop[]; shop: ShopCtx; nowIso: string }) {
  const t = useTranslations("ops");
  const locale = useLocale() as Locale;
  const ops = useOpsState({ bookings, sessions, nowIso, actor: shop.ownerName });
  const today = dayKey(nowIso, shop.timezone);
  const todays = ops.sessions
    .filter((s) => dayKey(s.startsAt, shop.timezone) === today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const customerOf = (id: string) => customers.find((c) => c.id === id);
  const workshopOf = (id: string) => workshops.find((w) => w.id === id);

  const live = ops.bookings.filter((b) => todays.some((s) => s.id === b.sessionId));
  const expected = live.filter((b) => holdsSeat(b.status)).reduce((n, b) => n + b.quantity, 0);
  const arrived = live.filter((b) => b.status === "CHECKED_IN" || b.status === "COMPLETED").reduce((n, b) => n + b.quantity, 0);

  return (
    <div className="grid gap-4">
      <header className="grid gap-1">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("today.title")}</h1>
        <p className="text-sm text-muted-foreground">{formatDayKey(today, locale)}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" />
          {t("common.tzNote", { tz: shop.timezone })}
        </p>
      </header>

      <dl className="grid grid-cols-3 gap-2 sm:max-w-xl">
        <Stat label={t("today.sessions")} value={todays.length} />
        <Stat label={t("today.guestsExpected")} value={expected} />
        <Stat label={t("today.arrived")} value={`${arrived}/${expected}`} />
      </dl>

      {todays.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("today.empty")}</CardContent></Card>
      ) : null}

      {todays.map((s) => {
        const w = workshopOf(s.workshopId);
        const list = ops.bookings.filter((b) => b.sessionId === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const checkedIn = list.filter((b) => b.status === "CHECKED_IN");
        const title = w ? pickLocalized(w.title, resolveShopLocale(locale, shop.enabledLocales, shop.defaultLocale), shop.defaultLocale) : "";
        return (
          <Card key={s.id}>
            <CardHeader className="gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base"><h2>{title}</h2></CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {formatTime(s.startsAt, shop.timezone, locale)} - {formatTime(s.endsAt, shop.timezone, locale)}
                    <span className="ml-1 text-xs">({shop.timezone})</span>
                  </p>
                </div>
                <SessionStatusBadge status={s.status} />
              </div>
              <CapacityBar reserved={s.reservedCount} capacity={s.capacity} />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm" variant="outline" disabled={checkedIn.length === 0}
                  onClick={() => checkedIn.forEach((b) => ops.perform(b.id, "COMPLETE"))}
                >
                  <CheckCheck aria-hidden="true" />
                  {t("today.completeAll", { count: checkedIn.length })}
                </Button>
                <Link
                  href={`/dashboard/bookings/new?session=${s.id}`}
                  className="inline-flex h-7 items-center rounded-lg border border-border px-2.5 text-[0.8rem] font-medium hover:bg-muted"
                >
                  {t("today.addWalkIn")}
                </Link>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3">
              {list.length === 0 ? <p className="text-sm text-muted-foreground">{t("today.noGuests")}</p> : null}
              <ul className="grid gap-3">
                {list.map((b) => {
                  const c = customerOf(b.customerId);
                  const inactive = b.status === "CANCELLED" || b.status === "LATE_RELEASED" || b.status === "NO_SHOW";
                  const balance = Math.max(0, b.totalAmount - netPaid(b.payments));
                  return (
                    <li key={b.id} className={`grid gap-2 rounded-lg border p-3 ${inactive ? "bg-muted/40" : ""}`}>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <Link href={`/dashboard/bookings/${b.id}`} className="font-medium underline-offset-4 hover:underline">
                            {c?.fullName ?? "-"}
                          </Link>
                          <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                            <span className="font-mono">{b.bookingCode}</span>
                            <span className="inline-flex items-center gap-1"><Users className="size-3" aria-hidden="true" />{t("common.guests", { count: b.quantity })}</span>
                            <span>{t(`source.${b.source}`)}</span>
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          <BookingStatusBadge status={b.status} />
                          <PaymentStatusBadge status={b.paymentStatus} />
                        </div>
                      </div>
                      {b.specialRequest ? <p className="text-xs italic text-muted-foreground">{t("common.request")}: {b.specialRequest}</p> : null}
                      {b.status !== "CANCELLED" ? (
                        <p className="text-xs text-muted-foreground">
                          {t("payment.balance")}: <span className="font-medium text-foreground">{formatMoney(balance, b.currency, locale)}</span>
                        </p>
                      ) : null}
                      <BookingActions booking={b} session={s} ops={ops} timezone={shop.timezone} compact />
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-xl font-semibold">{value}</dd>
    </div>
  );
}
