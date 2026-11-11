"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Ban, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import type { AdminAffiliate } from "@/lib/mock/admin-directory";
import { ReasonDialog } from "../reason-dialog";
import { fmt, landingUrl } from "../utils";
import { DirectoryTable, FilterBox, Notice, Pill, Toolbar, useDebounced, useDirectory, type Column } from "./kit";

/**
 * The referral (affiliate) links: a customer with an account picks a workshop and shares its link; a booking that comes through it earns them a referral fee. Search by the
 * email of the person who registered the account (or the code, the workshop, the shop) and by the day the link was made.
 */
export function AffiliateAdmin() {
  const t = useTranslations("admin.affiliate");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const typed = useDebounced(q);
  const bad = Boolean(from && to && from > to);
  const { items, error, reload } = useDirectory<AdminAffiliate>("affiliate", { q: typed, from, to: bad ? "" : to });
  const [toggle, setToggle] = useState<AdminAffiliate | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function change(r: AdminAffiliate, disabled: boolean, reason = "") {
    setToggle(null);
    const res = await fetch(`/api/v1/admin/affiliate/${encodeURIComponent(r.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ disabled, ...(reason ? { reason } : {}) }) }).catch(() => null);
    setMessage(res?.ok ? { text: t(disabled ? "disabledDone" : "enabledDone", { code: r.code }), tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }

  const columns: Column<AdminAffiliate>[] = [
    { key: "account", header: t("col.account"), cell: (r) => <><div className="font-medium">{r.accountEmail}</div><div className="text-xs text-muted-foreground">{r.accountName}</div></> },
    { key: "link", header: t("col.link"), cell: (r) => <a href={`${landingUrl(r.shopSlug)}/?ref=${encodeURIComponent(r.code)}`} target="_blank" rel="noreferrer" className="font-mono text-xs text-primary underline underline-offset-4">{r.code}<span className="sr-only"> {t("opensNewTab")}</span></a> },
    { key: "workshop", header: t("col.workshop"), cell: (r) => <><div>{r.workshopTitle}</div><div className="text-xs text-muted-foreground">{r.shopName}</div></> },
    { key: "created", header: t("col.created"), cell: (r) => fmt(r.createdAt, locale) },
    { key: "clicks", header: t("col.clicks"), className: "text-right tabular-nums", cell: (r) => r.clicks },
    { key: "bookings", header: t("col.bookings"), className: "text-right tabular-nums", cell: (r) => r.bookings },
    { key: "fee", header: t("col.fee"), className: "text-right tabular-nums", cell: (r) => formatMoney(r.referralFee, r.currency, locale) },
    { key: "state", header: t("col.state"), cell: (r) => (r.disabled ? <span title={r.disabledReason}><Pill tone="amber">{t("off")}</Pill></span> : <Pill tone="green">{t("on")}</Pill>) },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (r) => r.disabled
        ? <Button size="sm" variant="outline" onClick={() => void change(r, false)} data-testid="affiliate-enable"><CircleCheck aria-hidden /> {t("enable")}<span className="sr-only"> {r.code}</span></Button>
        : <Button size="sm" variant="outline" onClick={() => setToggle(r)} data-testid="affiliate-disable"><Ban aria-hidden /> {t("disable")}<span className="sr-only"> {r.code}</span></Button>,
    },
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
      <Notice message={message} />
      {bad ? <p role="alert" className="text-sm text-destructive">{t("dateOrder")}</p> : null}
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(r) => r.id} resetKey={`${typed}|${from}|${to}`} testId="affiliate-table" />
      <ReasonDialog
        open={toggle !== null} onOpenChange={(o) => { if (!o) setToggle(null); }} reason="required" destructive
        title={t("disableTitle", { code: toggle?.code ?? "" })} description={t("disableBody")} confirmLabel={t("disable")}
        onConfirm={(why) => { if (toggle) void change(toggle, true, why); }}
      />
    </div>
  );
}
