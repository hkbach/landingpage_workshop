"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy, Info } from "lucide-react";
import { formatMoney, type Locale } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fetchCustomerInvites } from "@/lib/customer-api";
import { formatDate } from "@/lib/format";
import { usePagination } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { useCustomer } from "./customer-shell";
import { WalletHistory, WalletOverview } from "./customer-wallet";

type Tab = "friends" | "history";

/**
 * Referrals: the customer invites friends to register a customer account with their ONE link (the same link for good). A friend who registered through it is a referral. When the friend
 * pays their first booking after registering, the customer earns the referral bonus: a percentage of the original price of that booking, set by the platform. The bonus is earned ONCE for
 * each referral; the note under the list says so.
 */
export function CustomerReferrals() {
  const t = useTranslations("customer");
  const tr = useTranslations("customer.referrals");
  const locale = useLocale() as Locale;
  const { accountId, email } = useCustomer();
  const query = useQuery({ queryKey: ["customer-invites", accountId, email ?? "no-login"], queryFn: () => fetchCustomerInvites(accountId, email), retry: false });
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const pg = usePagination(items, "");
  const tw = useTranslations("customer.wallet");
  const [tab, setTab] = useState<Tab>("friends");
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setFailed(false);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setFailed(true);
    }
  }

  if (query.isPending) return <p role="status" aria-busy="true" className="text-sm text-muted-foreground">{t("shell.loading")}</p>;
  if (query.isError || !query.data) {
    return (
      <div role="alert" className="grid justify-items-start gap-3">
        <p className="text-sm">{t("gate.loadFailed")}</p>
        <Button onClick={() => void query.refetch()}>{t("gate.retry")}</Button>
      </div>
    );
  }
  const data = query.data;
  const rate = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(data.bonusBps / 10_000);

  return (
    <div className="grid gap-5" data-testid="customer-referrals">
      <header>
        <h1 className="text-2xl font-semibold">{t("menu.referrals")}</h1>
        <p className="text-sm text-muted-foreground">{tr("intro")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{tr("linkTitle")}</CardTitle>
          <CardDescription>{tr("linkHint")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <span className="break-all rounded-lg border bg-muted/40 p-2 font-mono text-xs" data-testid="referral-link">{data.link}</span>
          <Button type="button" variant="outline" className="w-fit" onClick={() => void copy(data.link)} data-testid="referral-copy">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? tr("copied") : tr("copy")}
          </Button>
          {failed ? <p role="alert" className="text-xs text-destructive">{tr("copyFailed")}</p> : null}
        </CardContent>
      </Card>

      <WalletOverview source="REFERRAL" onRequested={() => setTab("history")} />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList aria-label={t("menu.referrals")}>
          <TabsTrigger value="friends" data-testid="referrals-tab-friends">{tr("tabFriends")}</TabsTrigger>
          <TabsTrigger value="history" data-testid="referrals-tab-history">{tw("tabHistory")}</TabsTrigger>
        </TabsList>
        <TabsContent value="friends" className="pt-2">
      <section aria-labelledby="ref-list-title" className="grid gap-3">
        <h2 id="ref-list-title" className="text-lg font-semibold">{tr("listTitle")}</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="referrals-empty">{tr("empty")}</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border bg-card">
              <Table data-testid="referrals-list">
                <TableHeader>
                  <TableRow>
                    <TableHead>{tr("col.friend")}</TableHead>
                    <TableHead>{tr("col.registered")}</TableHead>
                    <TableHead>{tr("col.status")}</TableHead>
                    <TableHead className="text-right">{tr("col.bonus")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pg.items.map((r) => (
                    <TableRow key={r.id} data-testid="referral-row">
                      <TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground">{r.email}</div></TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(r.registeredAt, "UTC", locale)}</TableCell>
                      <TableCell className="whitespace-normal">
                        <span data-testid="referral-status" className={cn("inline-flex rounded-md px-2 py-0.5 text-xs font-medium", r.status === "EARNED" ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-800")}>{tr(`status.${r.status}`)}</span>
                        {r.bookingCode ? <div className="mt-0.5 text-xs text-muted-foreground">{tr("forBooking", { code: r.bookingCode })}</div> : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums" data-testid="referral-bonus">{formatMoney(r.bonus, data.currency, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationBar {...pg.bar} />
          </>
        )}
        {/* The rule, always under the list: the bonus is earned once for each referral. */}
        <p role="note" className="flex items-start gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground" data-testid="referral-note">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>{tr("note", { rate })}</span>
        </p>
      </section>
        </TabsContent>
        <TabsContent value="history" className="pt-2"><WalletHistory source="REFERRAL" /></TabsContent>
      </Tabs>
    </div>
  );
}
