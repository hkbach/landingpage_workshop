"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { formatMoney, pickLocalized, type Locale, type Localized } from "@workshop/shared";
import { Field } from "@/components/dashboard/shell/field";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createCustomerReferral, fetchCustomerReferrals, type CustomerReferral } from "@/lib/customer-api";
import { usePagination } from "@/lib/pagination";
import { useCustomer } from "./customer-shell";

export interface ReferralWorkshop { id: string; title: Localized; shopName: string; defaultLocale: Locale }

/**
 * Referrals: the guest picks a workshop and gets a link to share (affiliate); a paid booking that comes through the link earns them the referral fee of that shop, a
 * percentage of the ORIGINAL price of the booking (set by the platform). The page lists their links with the clicks, the paid bookings and the referral fee each earned.
 */
export function CustomerReferrals({ workshops }: { workshops: ReferralWorkshop[] }) {
  const t = useTranslations("customer");
  const tr = useTranslations("customer.referrals");
  const locale = useLocale() as Locale;
  const { accountId, email } = useCustomer();
  const queryClient = useQueryClient();
  const key = ["customer-referrals", accountId, email ?? "no-login"];
  const query = useQuery({ queryKey: key, queryFn: () => fetchCustomerReferrals(accountId, email), retry: false });
  const [workshopId, setWorkshopId] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const options = useMemo(
    () => workshops.map((w) => ({ id: w.id, label: `${pickLocalized(w.title, locale, w.defaultLocale)} — ${w.shopName}` })).sort((a, b) => a.label.localeCompare(b.label, locale)),
    [workshops, locale],
  );
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const totals = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of items) by.set(r.currency, (by.get(r.currency) ?? 0) + r.referralFee);
    return [...by];
  }, [items]);
  const pg = usePagination(items, "");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!workshopId) { setNote({ text: tr("pick"), tone: "error" }); return; }
    setBusy(true);
    setNote(null);
    try {
      const existing = items.some((r) => r.workshopId === workshopId);
      await createCustomerReferral(accountId, email, workshopId);
      await queryClient.invalidateQueries({ queryKey: key });
      setNote({ text: tr(existing ? "existing" : "created"), tone: "ok" });
    } catch {
      setNote({ text: tr("failed"), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function copy(r: CustomerReferral) {
    try {
      await navigator.clipboard.writeText(r.link);
      setCopied(r.id);
      setTimeout(() => setCopied((c) => (c === r.id ? null : c)), 2000);
    } catch {
      setNote({ text: tr("copyFailed"), tone: "error" });
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

  return (
    <div className="grid gap-5" data-testid="customer-referrals">
      <header>
        <h1 className="text-2xl font-semibold">{t("menu.referrals")}</h1>
        <p className="text-sm text-muted-foreground">{tr("intro")}</p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("createTitle")}</CardTitle>
            <CardDescription>{tr("createHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} noValidate className="grid gap-3">
              <Field htmlFor="ref-workshop" label={tr("workshopLabel")}>
                <NativeSelect id="ref-workshop" value={workshopId} onChange={(e) => { setWorkshopId(e.target.value); setNote(null); }}>
                  <option value="">{tr("workshopPlaceholder")}</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </NativeSelect>
              </Field>
              <Button type="submit" disabled={busy} className="w-fit">{busy ? tr("creating") : tr("create")}</Button>
              {note ? <p role={note.tone === "error" ? "alert" : "status"} className={note.tone === "error" ? "text-sm text-destructive" : "text-sm text-emerald-800"}>{note.text}</p> : null}
            </form>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tr("totalTitle")}</CardTitle>
            <CardDescription>{tr("totalHint")}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1">
            {totals.length === 0 ? <p className="text-2xl font-semibold tabular-nums" data-testid="referral-total">—</p> : totals.map(([currency, amount]) => (
              <p key={currency} className="text-2xl font-semibold tabular-nums" data-testid="referral-total">{formatMoney(amount, currency, locale)}</p>
            ))}
          </CardContent>
        </Card>
      </div>

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
                    <TableHead>{tr("col.workshop")}</TableHead>
                    <TableHead>{tr("col.link")}</TableHead>
                    <TableHead className="text-right">{tr("col.rate")}</TableHead>
                    <TableHead className="text-right">{tr("col.clicks")}</TableHead>
                    <TableHead className="text-right">{tr("col.bookings")}</TableHead>
                    <TableHead className="text-right">{tr("col.fee")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pg.items.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell><div className="font-medium">{r.workshopTitle}</div><div className="text-xs text-muted-foreground">{t("workshops.shopLine", { shop: r.shopName })}</div></TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs">{r.code}</span>
                          <Button type="button" size="sm" variant="outline" onClick={() => void copy(r)}>
                            {copied === r.id ? <Check aria-hidden /> : <Copy aria-hidden />} {copied === r.id ? tr("copied") : tr("copy")}<span className="sr-only"> {r.code}</span>
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(r.referralBps / 10_000)}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.clicks}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.bookings}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatMoney(r.referralFee, r.currency, locale)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationBar {...pg.bar} />
          </>
        )}
      </section>
    </div>
  );
}
