"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Pause, Play } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import type { AdminVoucher } from "@/lib/admin-types";
import { ReasonDialog } from "../reason-dialog";
import { DirectoryTable, FilterBox, Notice, Pill, Toolbar, selectClass, useDebounced, useDirectory, type Column } from "./kit";

type Message = { text: string; tone: "ok" | "error" } | null;
const TONE = { ACTIVE: "green", SCHEDULED: "sky", PAUSED: "slate", EXPIRED: "amber" } as const;
const STATUSES = ["ACTIVE", "SCHEDULED", "PAUSED", "EXPIRED"] as const;

/**
 * The vouchers (promotions) of every shop: what each one gives, when it runs, how many bookings used it and how much it took off. A voucher that breaks the rules can be paused with a reason; the shop
 * owner then sees it as paused by the platform and cannot resume it, while the bookings that already used it keep their discount. Only an administrator can resume it.
 */
export function VouchersAdmin() {
  const t = useTranslations("admin.promotions");
  const locale = useLocale();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const typed = useDebounced(q);
  const { items, error, reload } = useDirectory<AdminVoucher>("promotions", { q: typed, status });
  const [pausing, setPausing] = useState<AdminVoucher | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const money = (n: number, c: string) => formatMoney(n, c, locale);

  async function change(v: AdminVoucher, hold: boolean, reason = "") {
    setPausing(null);
    const res = await fetch(`/api/v1/admin/promotions/${encodeURIComponent(v.id)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hold, ...(reason ? { reason } : {}) }) }).catch(() => null);
    setMessage(res?.ok ? { text: t(hold ? "paused" : "resumed", { code: v.code }), tone: "ok" } : { text: t("failed"), tone: "error" });
    reload();
  }

  const columns: Column<AdminVoucher>[] = [
    { key: "code", header: t("col.voucher"), cell: (v) => <><div className="font-mono text-xs font-semibold">{v.code}</div><div className="text-sm">{v.title}</div></> },
    { key: "shop", header: t("col.shop"), cell: (v) => v.shopName },
    { key: "discount", header: t("col.discount"), className: "whitespace-nowrap", cell: (v) => (v.discountType === "PERCENT" ? `${v.discountValue}%` : money(v.discountValue, v.currency)) },
    { key: "range", header: t("col.range"), className: "whitespace-nowrap text-sm", cell: (v) => `${v.startDate} → ${v.endDate}` },
    { key: "applies", header: t("col.applies"), cell: (v) => (v.appliesTo === "ALL" ? t("allWorkshops") : t("selectedWorkshops", { n: v.workshops })) },
    { key: "status", header: t("col.status"), cell: (v) => <span title={v.heldReason}><Pill tone={TONE[v.status]}>{t(`status.${v.status}`)}</Pill>{v.heldReason ? <span className="ml-1 text-xs text-amber-800" data-testid="voucher-held">{t("heldByPlatform")}</span> : null}</span> },
    { key: "used", header: t("col.used"), className: "text-right tabular-nums", cell: (v) => v.bookings },
    { key: "total", header: t("col.discountTotal"), className: "text-right tabular-nums", cell: (v) => money(v.discountTotal, v.currency) },
    {
      key: "actions", header: <span className="sr-only">{t("col.actions")}</span>, className: "text-right",
      cell: (v) => v.heldReason
        ? <Button size="sm" variant="outline" onClick={() => void change(v, false)} data-testid="voucher-resume"><Play aria-hidden /> {t("resume")}<span className="sr-only"> {v.code}</span></Button>
        : v.status === "ACTIVE" || v.status === "SCHEDULED"
          ? <Button size="sm" variant="outline" onClick={() => setPausing(v)} data-testid="voucher-pause"><Pause aria-hidden /> {t("pause")}<span className="sr-only"> {v.code}</span></Button>
          : null,
    },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <Notice message={message} />
      <Toolbar label={t("search")} placeholder={t("searchPlaceholder")} value={q} onChange={setQ}>
        <FilterBox id="vo-status" label={t("col.status")}>
          <select id="vo-status" className={selectClass} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
          </select>
        </FilterBox>
      </Toolbar>
      <DirectoryTable rows={items} error={error} columns={columns} rowKey={(v) => v.id} resetKey={`${typed}|${status}`} testId="promotions-table" />
      <ReasonDialog
        open={pausing !== null} onOpenChange={(o) => { if (!o) setPausing(null); }} reason="required" destructive
        title={t("pauseTitle", { code: pausing?.code ?? "" })} description={t("pauseBody")} confirmLabel={t("pause")}
        onConfirm={(why) => { if (pausing) void change(pausing, true, why); }}
      />
    </div>
  );
}
