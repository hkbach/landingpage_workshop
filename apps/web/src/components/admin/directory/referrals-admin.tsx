"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import type { AdminReferral } from "@/lib/mock/admin-directory";
import { fmt, landingUrl } from "../utils";
import { DirectoryTable, FilterBox, Toolbar, useDebounced, useDirectory, type Column } from "./kit";

/**
 * The referral (affiliate) links: a customer with an account picks a workshop and shares its link; a booking that comes through it earns them a referral fee. Search by the
 * email of the person who registered the account (or the code, the workshop, the shop) and by the day the link was made.
 */
export function ReferralsAdmin() {
  const t = useTranslations("admin.referrals");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const typed = useDebounced(q);
  const bad = Boolean(from && to && from > to);
  const { items, error } = useDirectory<AdminReferral>("referrals", { q: typed, from, to: bad ? "" : to });

  const columns: Column<AdminReferral>[] = [
    { key: "account", header: t("col.account"), cell: (r) => <><div className="font-medium">{r.accountEmail}</div><div className="text-xs text-muted-foreground">{r.accountName}</div></> },
    { key: "link", header: t("col.link"), cell: (r) => <a href={`${landingUrl(r.shopSlug)}/?ref=${encodeURIComponent(r.code)}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline underline-offset-4">{r.code}<span className="sr-only"> {t("opensNewTab")}</span></a> },
    { key: "workshop", header: t("col.workshop"), cell: (r) => <><div>{r.workshopTitle}</div><div className="text-xs text-muted-foreground">{r.shopName}</div></> },
    { key: "created", header: t("col.created"), cell: (r) => fmt(r.createdAt, locale) },
    { key: "clicks", header: t("col.clicks"), className: "text-right tabular-nums", cell: (r) => r.clicks },
    { key: "bookings", header: t("col.bookings"), className: "text-right tabular-nums", cell: (r) => r.bookings },
    { key: "fee", header: t("col.fee"), className: "text-right tabular-nums", cell: (r) => formatMoney(r.referralFee, r.currency, locale) },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="rf-from" label={t("from")}><DateInput id="rf-from" value={from} onChange={setFrom} max={to || undefined} lenient /></FilterBox>
        <FilterBox id="rf-to" label={t("to")}><DateInput id="rf-to" value={to} onChange={setTo} min={from || undefined} lenient /></FilterBox>
        {from || to ? <Button type="button" variant="outline" onClick={() => { setFrom(""); setTo(""); }}>{t("clearDates")}</Button> : null}
      </Toolbar>
      {bad ? <p role="alert" className="text-sm text-destructive">{t("dateOrder")}</p> : null}
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(r) => r.id} resetKey={`${typed}|${from}|${to}`} testId="referrals-table" />
    </div>
  );
}
