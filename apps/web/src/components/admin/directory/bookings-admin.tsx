"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { formatDateTime } from "@/lib/format";
import type { AdminBooking } from "@/lib/mock/admin-directory";
import { fmt } from "../utils";
import { DetailDialog, DirectoryTable, FilterBox, Pill, Toolbar, humanize, useDebounced, useDirectory, type Column } from "./kit";

const TONE = { NOT_CONFIRMED: "amber", CONFIRMED: "sky", CHECKED_IN: "green", CANCELLED: "red" } as const;

/**
 * The bookings of every shop: search by the workshop, the shop, the booking code, or the email or the id of the person; filter by the day the booking was made; open the
 * detail of a booking.
 */
export function BookingsAdmin() {
  const t = useTranslations("admin.bookings");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const typed = useDebounced(q);
  const bad = Boolean(from && to && from > to);
  const { items, error } = useDirectory<AdminBooking>("bookings", { q: typed, from, to: bad ? "" : to });
  const [detail, setDetail] = useState<AdminBooking | null>(null);

  const columns: Column<AdminBooking>[] = [
    { key: "code", header: t("col.code"), cell: (b) => <span className="font-mono text-xs">{b.bookingCode}</span> },
    { key: "workshop", header: t("col.workshop"), cell: (b) => <><div className="font-medium">{b.workshopTitle}</div><div className="text-xs text-muted-foreground">{b.shopName}</div></> },
    { key: "guest", header: t("col.guest"), cell: (b) => <><div>{b.guestName}</div><div className="text-xs text-muted-foreground">{b.customerEmail || b.customerId}</div></> },
    { key: "session", header: t("col.session"), cell: (b) => formatDateTime(b.startsAt, b.timezone, locale) },
    { key: "made", header: t("col.made"), cell: (b) => fmt(b.createdAt, locale) },
    { key: "status", header: t("col.status"), cell: (b) => <span className="inline-flex flex-wrap gap-1"><Pill tone={TONE[b.status]}>{t(`status.${b.status}`)}</Pill><Pill tone={b.paymentStatus === "PAID" ? "green" : "slate"}>{t(`payment.${b.paymentStatus}`)}</Pill></span> },
    { key: "total", header: t("col.total"), className: "text-right", cell: (b) => formatMoney(b.totalAmount, b.currency, locale) },
    { key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right", cell: (b) => <Button size="sm" variant="outline" onClick={() => setDetail(b)}>{t("view")}</Button> },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="bk-from" label={t("from")}><DateInput id="bk-from" value={from} onChange={setFrom} max={to || undefined} lenient /></FilterBox>
        <FilterBox id="bk-to" label={t("to")}><DateInput id="bk-to" value={to} onChange={setTo} min={from || undefined} lenient /></FilterBox>
        {from || to ? <Button type="button" variant="outline" onClick={() => { setFrom(""); setTo(""); }}>{t("clearDates")}</Button> : null}
      </Toolbar>
      {bad ? <p role="alert" className="text-sm text-destructive">{t("dateOrder")}</p> : null}
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(b) => b.id} resetKey={`${typed}|${from}|${to}`} testId="bookings-table" />
      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.bookingCode ?? ""} description={detail ? `${detail.workshopTitle} · ${detail.shopName}` : ""}
        rows={detail ? [
          [t("col.status"), t(`status.${detail.status}`)], [t("col.payment"), t(`payment.${detail.paymentStatus}`)], [t("source"), humanize(detail.source)],
          [t("col.guest"), detail.guestName], [t("email"), detail.customerEmail], [t("phone"), detail.customerPhone], [t("customerId"), detail.customerId], [t("accountId"), detail.accountId],
          [t("col.session"), `${detail.sessionCode} · ${formatDateTime(detail.startsAt, detail.timezone, locale)}`], [t("quantity"), detail.quantity],
          [t("unitPrice"), formatMoney(detail.unitPriceAmount, detail.currency, locale)], [t("discount"), formatMoney(detail.discountAmount, detail.currency, locale)], [t("col.total"), formatMoney(detail.totalAmount, detail.currency, locale)],
          [t("col.made"), fmt(detail.createdAt, locale)], [t("checkedIn"), detail.checkedInAt ? fmt(detail.checkedInAt, locale) : ""], [t("request"), detail.specialRequest], [t("cancelReason"), detail.cancelReason],
          [t("payments"), detail.payments.length ? detail.payments.map((p) => `${p.type === "REFUND" ? "−" : "+"}${formatMoney(p.amount, detail.currency, locale)} ${humanize(p.method)} · ${fmt(p.recordedAt, locale)}`).join("; ") : ""],
        ] : []}
      />
    </div>
  );
}
