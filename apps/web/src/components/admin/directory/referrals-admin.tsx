"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Ban, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import type { AdminReferralLink } from "@/lib/admin-types";
import { ReasonDialog } from "../reason-dialog";
import { fmt } from "../utils";
import { DetailDialog, DirectoryTable, FilterBox, Notice, Pill, Toolbar, useDebounced, useDirectory, type Column } from "./kit";

/**
 * The referral program: a customer invites friends to register a customer account with their ONE invite link. The friend is the customer's referral; when the friend pays their first
 * booking after registering, the customer earns the referral bonus (a percentage of the original price of that booking, set in Config fees), once for each friend. Search by the email of
 * the customer (or the code, or a friend), and by the day the friends registered; the detail lists the friends.
 */
export function ReferralsAdmin() {
  const t = useTranslations("admin.referrals");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const typed = useDebounced(q);
  const bad = Boolean(from && to && from > to);
  const { items, error, reload } = useDirectory<AdminReferralLink>("referrals", { q: typed, from, to: bad ? "" : to });
  const [toggle, setToggle] = useState<AdminReferralLink | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);

  async function change(r: AdminReferralLink, disabled: boolean, reason = "") {
    setToggle(null);
    const res = await fetch(`/api/v1/admin/referrals/${encodeURIComponent(r.inviterId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ disabled, ...(reason ? { reason } : {}) }) }).catch(() => null);
    setMessage(res?.ok ? { text: t(disabled ? "disabledDone" : "enabledDone", { email: r.inviterEmail }), tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }
  const [detail, setDetail] = useState<AdminReferralLink | null>(null);
  const money = (n: number, currency: string) => formatMoney(n, currency, locale);

  const columns: Column<AdminReferralLink>[] = [
    { key: "customer", header: t("col.customer"), cell: (r) => <><div className="font-medium">{r.inviterEmail}</div><div className="text-xs text-muted-foreground">{r.inviterName}</div></> },
    { key: "link", header: t("col.link"), cell: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "registered", header: t("col.registered"), className: "text-right tabular-nums", cell: (r) => r.registered },
    { key: "earned", header: t("col.earned"), className: "text-right tabular-nums", cell: (r) => r.earned },
    { key: "bonus", header: t("col.bonus"), className: "text-right tabular-nums", cell: (r) => money(r.bonusTotal, r.currency) },
    { key: "state", header: t("col.state"), cell: (r) => (r.disabled ? <span title={r.disabledReason}><Pill tone="amber">{t("off")}</Pill></span> : <Pill tone="green">{t("on")}</Pill>) },
    { key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right", cell: (r) => (<div className="flex flex-wrap justify-end gap-1.5"><Button size="sm" variant="outline" onClick={() => setDetail(r)}>{t("view")}<span className="sr-only"> {r.inviterEmail}</span></Button>{r.disabled ? <Button size="sm" variant="outline" onClick={() => void change(r, false)} data-testid="referral-enable"><CircleCheck aria-hidden /> {t("enable")}</Button> : <Button size="sm" variant="outline" onClick={() => setToggle(r)} data-testid="referral-disable"><Ban aria-hidden /> {t("disable")}</Button>}</div>) },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="rl-from" label={t("from")}><DateInput id="rl-from" value={from} onChange={setFrom} max={to || undefined} lenient /></FilterBox>
        <FilterBox id="rl-to" label={t("to")}><DateInput id="rl-to" value={to} onChange={setTo} min={from || undefined} lenient /></FilterBox>
        {from || to ? <Button type="button" variant="outline" onClick={() => { setFrom(""); setTo(""); }}>{t("clearDates")}</Button> : null}
      </Toolbar>
      <Notice message={message} />
      {bad ? <p role="alert" className="text-sm text-destructive">{t("dateOrder")}</p> : null}
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(r) => r.inviterId} resetKey={`${typed}|${from}|${to}`} testId="referrals-table" />
      <ReasonDialog
        open={toggle !== null} onOpenChange={(o) => { if (!o) setToggle(null); }} reason="required" destructive
        title={t("disableTitle", { email: toggle?.inviterEmail ?? "" })} description={t("disableBody")} confirmLabel={t("disable")}
        onConfirm={(why) => { if (toggle) void change(toggle, true, why); }}
      />
      <p className="text-xs text-muted-foreground">{t("rule")}</p>
      <DetailDialog
        open={detail !== null} onClose={() => setDetail(null)} title={detail?.inviterEmail ?? ""} description={detail ? `${detail.inviterName} · ${detail.code}` : ""}
        rows={detail ? [[t("col.registered"), detail.registered], [t("col.earned"), detail.earned], [t("col.bonus"), money(detail.bonusTotal, detail.currency)]] : []}
      >
        {detail && detail.friends.length > 0 ? (
          <ul className="grid gap-2 text-sm" data-testid="referral-friends">
            {detail.friends.map((f) => (
              <li key={f.inviteId} className="grid gap-0.5 rounded-lg border p-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{f.email}</span>
                  <Pill tone={f.status === "EARNED" ? "green" : "slate"}>{t(`status.${f.status}`)}</Pill>
                </div>
                <span className="text-xs text-muted-foreground">{f.name} · {t("registeredOn", { date: fmt(f.registeredAt, locale) })}</span>
                {f.status === "EARNED" ? <span className="text-xs">{t("bonusOn", { amount: money(f.bonus, detail.currency), code: f.bookingCode })}</span> : null}
              </li>
            ))}
          </ul>
        ) : detail ? <p className="text-sm text-muted-foreground">{t("noFriends")}</p> : null}
      </DetailDialog>
    </div>
  );
}
