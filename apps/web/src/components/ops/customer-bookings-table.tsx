"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { usePagination } from "@/lib/pagination";
import type { Booking } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { nextSort, sortRows, type SortState } from "@/lib/table-sort";
import { BookingStatusBadge, PaymentStatusBadge } from "./status-badges";
import { SortableHead } from "./sortable-head";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/**
 * Every booking a customer has made as a small table: code (a link to the booking), workshop, session, status, payment, total. It comes in the order
 * of `bookings` (the caller puts the booking made most recently first); a click on a header sorts it by that column (and again for the other way, and again to go back).
 */
export function CustomerBookingsTable({ bookings, timezone }: { bookings: Booking[]; timezone: string }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const [sort, setSort] = useState<SortState>(null);
  const onSort = (k: string) => setSort((s) => nextSort(s, k));
  // The status and the payment are sorted by the words the person reads, in their language.
  const sorted = sortRows(bookings, sort, (b, key) => {
    switch (key) {
      case "code": return b.bookingCode;
      case "booked": return b.createdAt;
      case "workshop": return b.workshopTitle;
      case "session": return b.startsAt;
      case "status": return t(`bookingStatus.${b.status}`);
      case "payment": return t(`paymentStatus.${b.paymentStatus}`);
      case "total": return b.totalAmount;
      default: return null;
    }
  }, locale);
  const pg = usePagination(sorted, JSON.stringify(sort));
  const rows = pg.items;
  return (
    <div className="overflow-x-auto rounded-lg border bg-background">
      <Table data-testid="customer-bookings-table">
        <TableHeader>
          <TableRow>
            <SortableHead label={t("bookings.code")} sortKey="code" sort={sort} onSort={onSort} />
            <SortableHead label={t("bookings.bookedOn")} sortKey="booked" sort={sort} onSort={onSort} />
            <SortableHead label={t("bookings.workshop")} sortKey="workshop" sort={sort} onSort={onSort} />
            <SortableHead label={t("bookings.session")} sortKey="session" sort={sort} onSort={onSort} />
            <SortableHead label={t("bookings.status")} sortKey="status" sort={sort} onSort={onSort} />
            <SortableHead label={t("bookings.payment")} sortKey="payment" sort={sort} onSort={onSort} />
            <SortableHead label={t("payment.total")} sortKey="total" align="right" sort={sort} onSort={onSort} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((b) => (
            <TableRow key={b.id} data-testid="customer-booking">
              <TableCell><ShopLink href={`/shopowner/bookings/${b.id}`} className="font-mono font-medium underline-offset-4 hover:underline">{b.bookingCode}</ShopLink></TableCell>
              <TableCell className="whitespace-nowrap" data-testid="booked-on">{formatDateTime(b.createdAt, timezone, locale)}</TableCell>
              <TableCell>{b.workshopTitle}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDateTime(b.startsAt, timezone, locale)}</TableCell>
              <TableCell><BookingStatusBadge status={b.status} /></TableCell>
              <TableCell><PaymentStatusBadge status={b.paymentStatus} /></TableCell>
              <TableCell className="text-right">{formatMoney(b.totalAmount, b.currency, locale)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationBar {...pg.bar} />
    </div>
  );
}
