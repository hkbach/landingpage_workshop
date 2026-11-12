"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, X } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import type { AdminWithdrawal } from "@/lib/mock/admin-directory";
import { ReasonDialog } from "../reason-dialog";
import { fmt } from "../utils";
import { DirectoryTable, FilterBox, Notice, Pill, Toolbar, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;
const TONE = { PENDING: "amber", PAID: "green", REJECTED: "red" } as const;

/**
 * The withdrawals customers asked for from the Affiliate and the Referrals programs: one invoice each. A pending invoice is paid (the money was sent) or rejected (with a reason; the amount
 * goes back to the balance of the customer). A processed invoice does not change. Search by the invoice number or the email (or name) of the customer.
 */
export function WithdrawalsAdmin() {
  const t = useTranslations("admin.withdrawals");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const typed = useDebounced(q);
  const bad = Boolean(from && to && from > to);
  const { items, error, reload } = useDirectory<AdminWithdrawal>("withdrawals", { q: typed, status, source, from, to: bad ? "" : to });
  const everything = useDirectory<AdminWithdrawal>("withdrawals", {});
  const [paying, setPaying] = useState<AdminWithdrawal | null>(null);
  const [rejecting, setRejecting] = useState<AdminWithdrawal | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const money = (n: number, currency: string) => formatMoney(n, currency, locale);

  // The figures at the top are the whole list, whatever the filters are.
  const totals = useMemo(() => {
    const all = everything.items ?? [];
    const sum = (s: string) => all.filter((w) => w.status === s).reduce((n, w) => n + w.amount, 0);
    return { pendingCount: all.filter((w) => w.status === "PENDING").length, pending: sum("PENDING"), paid: sum("PAID"), rejectedCount: all.filter((w) => w.status === "REJECTED").length, currency: all[0]?.currency ?? "VND" };
  }, [everything.items]);

  async function process(w: AdminWithdrawal, action: "pay" | "reject", reason = "") {
    const res = await fetch(`/api/v1/admin/withdrawals/${encodeURIComponent(w.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...(reason ? { reason } : {}) }) }).catch(() => null);
    setPaying(null);
    setRejecting(null);
    setMessage(res?.ok ? { text: t(action === "pay" ? "paidDone" : "rejectedDone", { code: w.code }), tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
    everything.reload();
  }

  const columns: Column<AdminWithdrawal>[] = [
    { key: "code", header: t("col.invoice"), cell: (w) => <span className="font-mono text-xs">{w.code}</span> },
    { key: "customer", header: t("col.customer"), cell: (w) => <><div className="font-medium">{w.accountEmail}</div><div className="text-xs text-muted-foreground">{w.accountName}</div></> },
    { key: "program", header: t("col.program"), cell: (w) => t(`program.${w.source}`) },
    { key: "amount", header: t("col.amount"), className: "text-right tabular-nums", cell: (w) => money(w.amount, w.currency) },
    { key: "bank", header: t("col.bank"), cell: (w) => (w.bankName ? <><div>{w.bankName}</div><div className="font-mono text-xs" data-testid="withdrawal-account">{w.accountNumber}</div></> : <span className="text-xs text-muted-foreground">{t("bankMissing")}</span>) },
    { key: "requested", header: t("col.requested"), cell: (w) => fmt(w.requestedAt, locale) },
    {
      key: "status", header: t("col.status"),
      cell: (w) => (
        <div className="grid gap-0.5">
          <span><Pill tone={TONE[w.status]}>{t(`status.${w.status}`)}</Pill></span>
          {w.processedAt ? <span className="text-xs text-muted-foreground">{fmt(w.processedAt, locale)}</span> : null}
          {w.reason ? <span className="max-w-xs whitespace-normal text-xs text-muted-foreground">{t("reason", { reason: w.reason })}</span> : null}
        </div>
      ),
    },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (w) => w.status === "PENDING" ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" onClick={() => setPaying(w)}><Check aria-hidden /> {t("pay")}<span className="sr-only"> {w.code}</span></Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(w)}><X aria-hidden /> {t("reject")}<span className="sr-only"> {w.code}</span></Button>
        </div>
      ) : null,
    },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <div className="grid gap-3 sm:grid-cols-3" data-testid="withdrawals-totals">
        <Card><CardHeader><CardTitle className="text-base">{t("pendingTitle")}</CardTitle><CardDescription>{t("pendingCount", { count: totals.pendingCount })}</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums" data-testid="total-pending">{money(totals.pending, totals.currency)}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">{t("paidTitle")}</CardTitle><CardDescription>{t("paidHint")}</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums" data-testid="total-paid">{money(totals.paid, totals.currency)}</p></CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">{t("rejectedTitle")}</CardTitle><CardDescription>{t("rejectedHint")}</CardDescription></CardHeader><CardContent><p className="text-2xl font-semibold tabular-nums" data-testid="total-rejected">{totals.rejectedCount}</p></CardContent></Card>
      </div>
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="wd-status" label={t("col.status")}>
          <select id="wd-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            {(["PENDING", "PAID", "REJECTED"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="wd-source" label={t("col.program")}>
          <select id="wd-source" className={selectClass} value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">{t("all")}</option>
            {(["AFFILIATE", "REFERRAL"] as const).map((s) => <option key={s} value={s}>{t(`program.${s}`)}</option>)}
          </select>
        </FilterBox>
        <FilterBox id="wd-from" label={t("from")}><DateInput id="wd-from" value={from} onChange={setFrom} max={to || undefined} lenient /></FilterBox>
        <FilterBox id="wd-to" label={t("to")}><DateInput id="wd-to" value={to} onChange={setTo} min={from || undefined} lenient /></FilterBox>
        {from || to ? <Button type="button" variant="outline" onClick={() => { setFrom(""); setTo(""); }}>{t("clearDates")}</Button> : null}
      </Toolbar>
      {bad ? <p role="alert" className="text-sm text-destructive">{t("dateOrder")}</p> : null}
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(w) => w.id} resetKey={`${typed}|${status}|${source}|${from}|${to}`} testId="withdrawals-table" />
      <p className="text-xs text-muted-foreground">{t("rule")}</p>
      <ReasonDialog
        open={paying !== null} onOpenChange={(o) => { if (!o) setPaying(null); }} reason="none"
        title={paying ? t("payTitle", { code: paying.code }) : ""} description={paying ? (paying.bankName ? t("payBodyBank", { amount: money(paying.amount, paying.currency), bank: paying.bankName, number: paying.accountNumber, email: paying.accountEmail }) : t("payBody", { amount: money(paying.amount, paying.currency), email: paying.accountEmail })) : ""} confirmLabel={t("pay")}
        onConfirm={() => { if (paying) void process(paying, "pay"); }}
      />
      <ReasonDialog
        open={rejecting !== null} onOpenChange={(o) => { if (!o) setRejecting(null); }} reason="required" destructive
        title={rejecting ? t("rejectTitle", { code: rejecting.code }) : ""} description={rejecting ? t("rejectBody", { amount: money(rejecting.amount, rejecting.currency) }) : ""} confirmLabel={t("reject")}
        onConfirm={(why) => { if (rejecting) void process(rejecting, "reject", why); }}
      />
    </div>
  );
}
