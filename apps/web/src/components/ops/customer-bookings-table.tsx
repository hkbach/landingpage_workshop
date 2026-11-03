"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Booking } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { BookingStatusBadge, PaymentStatusBadge } from "./status-badges";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/** Every booking a customer has made (the caller sorts them), as a small table: code (a link to the booking), workshop, session, status, payment, total. */
export function CustomerBookingsTable({ bookings, timezone }: { bookings: Booking[]; timezone: string }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("bookings.code")}</TableHead>
            <TableHead>{t("bookings.workshop")}</TableHead>
            <TableHead>{t("bookings.session")}</TableHead>
            <TableHead>{t("bookings.status")}</TableHead>
            <TableHead>{t("bookings.payment")}</TableHead>
            <TableHead className="text-right">{t("payment.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bookings.map((b) => (
            <TableRow key={b.id} data-testid="customer-booking">
              <TableCell><ShopLink href={`/shopowner/bookings/${b.id}`} className="font-mono font-medium underline-offset-4 hover:underline">{b.bookingCode}</ShopLink></TableCell>
              <TableCell>{b.workshopTitle}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateTime(b.startsAt, timezone, locale)}</TableCell>
              <TableCell><BookingStatusBadge status={b.status} /></TableCell>
              <TableCell><PaymentStatusBadge status={b.paymentStatus} /></TableCell>
              <TableCell className="text-right">{formatMoney(b.totalAmount, b.currency, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
