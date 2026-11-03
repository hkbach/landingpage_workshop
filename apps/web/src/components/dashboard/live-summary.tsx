"use client";

import { useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Globe, Wallet } from "lucide-react";
import { filterLedger, formatMoney, lastMonthKeys, MAX_LANDING_PAGES_PER_SHOP, summarizeLedger, type LedgerRow, type OrgStatus } from "@workshop/shared";
import { loadLivePageId, loadPages } from "@/components/builder/pages-store";
import type { TemplateKey } from "@/components/sections/templates";
import { SummaryCard } from "./summary-card";

const noop = () => () => {};

interface Props {
  /** Every payment and refund with its fees (the rates come from the platform administrator). */
  rows: LedgerRow[];
  currency: string;
  timezone: string;
  mainPage: { name: string; template: TemplateKey; seed?: { id: string; name: string; template: TemplateKey }[] };
  shopStatus: OrgStatus;
}

/**
 * The two summaries whose data is not rendered on the server (the income of this month, the list of landing pages kept in the browser), so
 * they are only read after hydration. They are laid out as grid items next to the server-rendered summary cards.
 */
export function LiveSummary(props: Props) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  const t = useTranslations("dashboard.overview.summary");
  if (!hydrated) {
    return (
      <>
        <li className="rounded-xl border p-4 text-sm text-muted-foreground" aria-busy>{t("finance.title")}…</li>
        <li className="rounded-xl border p-4 text-sm text-muted-foreground" aria-busy>{t("pages.title")}…</li>
      </>
    );
  }
  return <LiveInner {...props} />;
}

function LiveInner({ rows, currency, timezone, mainPage, shopStatus }: Props) {
  const t = useTranslations("dashboard.overview.summary");
  const locale = useLocale();
  const money = (n: number) => formatMoney(n, currency, locale);
  const [now] = useState(() => new Date());
  const month = lastMonthKeys(now, timezone, 1);
  const totals = summarizeLedger(filterLedger(rows, month, timezone));
  const pages = loadPages(mainPage);
  const liveId = loadLivePageId(shopStatus === "ACTIVE");
  const live = pages.find((p) => p.id === liveId);

  return (
    <>
      <SummaryCard
        href="/shopowner/finance" icon={Wallet} title={t("finance.title")} linkLabel={t("open")}
        rows={[
          { label: t("finance.income"), value: money(totals.income) },
          { label: t("finance.fees"), value: money(totals.fees) },
          { label: totals.profit < 0 ? t("finance.loss") : t("finance.profit"), value: money(totals.profit), negative: totals.profit < 0 },
        ]}
      />
      <SummaryCard
        href="/shopowner/site" icon={Globe} title={t("pages.title")} linkLabel={t("open")}
        rows={[
          { label: t("pages.count"), value: `${pages.length} / ${MAX_LANDING_PAGES_PER_SHOP}` },
          { label: t("pages.public"), value: live ? live.name : t("pages.none") },
        ]}
      />
    </>
  );
}
