"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, Copy } from "lucide-react";
import { formatMoney, type Locale } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePagination } from "@/lib/pagination";
import type { ListedShop } from "@/lib/mock/customer-listing";
import { cn } from "@/lib/utils";
import { AffiliateSummary, useAffiliates } from "./customer-affiliate";
import { CustomerWorkshops } from "./customer-workshops";

type Tab = "program" | "links";

/**
 * The Affiliate page. Program lists the workshops that are active (a workshop that was deactivated is not in it) with Register Affiliate / Copy Affiliate link; Affiliate link
 * lists the links the guest made by registering, each with the paid bookings that came through it, the affiliate fee earned on it and its status: On-going, or Deactive once the
 * workshop was deactivated.
 */
export function CustomerAffiliatePage({ shops }: { shops: ListedShop[] }) {
  const t = useTranslations("customer");
  const ta = useTranslations("customer.affiliate");
  const [tab, setTab] = useState<Tab>("program");
  return (
    <div className="grid gap-4" data-testid="customer-affiliate">
      <h1 className="text-2xl font-semibold">{t("menu.affiliate")}</h1>
      <AffiliateSummary />
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList aria-label={t("menu.affiliate")}>
          <TabsTrigger value="program" data-testid="affiliate-tab-program">{ta("tabProgram")}</TabsTrigger>
          <TabsTrigger value="links" data-testid="affiliate-tab-links">{ta("tabLinks")}</TabsTrigger>
        </TabsList>
        <TabsContent value="program" className="pt-2"><CustomerWorkshops shops={shops} mode="affiliate" /></TabsContent>
        <TabsContent value="links" className="pt-2"><AffiliateLinks /></TabsContent>
      </Tabs>
    </div>
  );
}

/** The links the guest made: the link (to copy) and its status. */
function AffiliateLinks() {
  const t = useTranslations("customer");
  const ta = useTranslations("customer.affiliate");
  const locale = useLocale() as Locale;
  const { query } = useAffiliates();
  const items = query.data?.items ?? [];
  const pg = usePagination(items, "");
  const [copied, setCopied] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function copy(id: string, link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setFailed(false);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2500);
    } catch {
      setFailed(true);
    }
  }

  if (query.isPending) return <p role="status" aria-busy="true" className="text-sm text-muted-foreground">{t("shell.loading")}</p>;
  if (query.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-3">
        <p className="text-sm">{t("gate.loadFailed")}</p>
        <Button onClick={() => void query.refetch()}>{t("gate.retry")}</Button>
      </div>
    );
  }
  if (items.length === 0) return <p className="text-sm text-muted-foreground" data-testid="affiliate-links-empty">{ta("linksEmpty")}</p>;
  return (
    <div className="grid gap-3">
      {failed ? <p role="alert" className="text-sm text-destructive">{ta("copyFailed")}</p> : null}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <Table data-testid="affiliate-links">
          <TableHeader>
            <TableRow>
              <TableHead>{ta("colLink")}</TableHead>
              <TableHead className="text-right">{ta("colBookings")}</TableHead>
              <TableHead className="text-right">{ta("colEarned")}</TableHead>
              <TableHead>{ta("colStatus")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pg.items.map((r) => {
              const live = r.status === "ON_GOING";
              return (
                <TableRow key={r.id} data-testid="affiliate-link-row">
                  <TableCell className="whitespace-normal">
                    <div className="font-medium">{r.workshopTitle}</div>
                    <div className="text-xs text-muted-foreground">{t("workshops.shopLine", { shop: r.shopName })}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="break-all font-mono text-xs" data-testid="affiliate-link-url">{r.link}</span>
                      <Button type="button" size="sm" variant="outline" disabled={!live} onClick={() => void copy(r.id, r.link)} title={live ? undefined : ta("deactiveHint")}>
                        {copied === r.id ? <Check aria-hidden /> : <Copy aria-hidden />} {copied === r.id ? ta("copied") : ta("copy")}
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums" data-testid="affiliate-link-bookings">{r.bookings}</TableCell>
                  <TableCell className="text-right tabular-nums" data-testid="affiliate-link-earned">{formatMoney(r.referralFee, r.currency, locale)}</TableCell>
                  <TableCell>
                    <span data-testid="affiliate-link-status" className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", live ? "bg-emerald-100 text-emerald-900" : "bg-slate-200 text-slate-800")}>
                      {ta(live ? "statusOngoing" : "statusDeactive")}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <PaginationBar {...pg.bar} />
    </div>
  );
}
