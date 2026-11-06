"use client";

import { useCallback, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Share2 } from "lucide-react";
import { formatMoney, type Locale } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { createCustomerReferral, fetchCustomerReferrals, type CustomerReferral } from "@/lib/customer-api";
import { useCustomer } from "./customer-shell";

/** The affiliate links of the guest and the affiliate fee of every shop (the same query for the whole page, so a card that registers updates the others at once). */
export function useAffiliates() {
  const { accountId, email } = useCustomer();
  const queryClient = useQueryClient();
  const key = useMemo(() => ["customer-affiliate", accountId, email ?? "no-login"], [accountId, email]);
  const query = useQuery({ queryKey: key, queryFn: () => fetchCustomerReferrals(accountId, email), retry: false });
  const byWorkshop = useMemo(() => new Map((query.data?.items ?? []).map((r) => [r.workshopId, r])), [query.data]);
  const register = useCallback(async (workshopId: string) => {
    const made = await createCustomerReferral(accountId, email, workshopId);
    await queryClient.invalidateQueries({ queryKey: key });
    return made;
  }, [accountId, email, key, queryClient]);
  return { query, byWorkshop, register, rates: query.data?.rates ?? {}, shopOfWorkshop: query.data?.shopOfWorkshop ?? {} };
}

/**
 * The button of a workshop on the Affiliate page. Before the guest registers it is Register Affiliate; once registered it is replaced by Copy Affiliate link, which copies the
 * link the guest sends to people they invite: it opens the booking of that workshop at its shop.
 */
export function AffiliateAction({ workshopId, testId = "affiliate-action" }: { workshopId: string; testId?: string }) {
  const t = useTranslations("customer.affiliate");
  const { byWorkshop, register, query } = useAffiliates();
  const link = byWorkshop.get(workshopId);
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "copied" | "failed" | "registerFailed">("idle");

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setState("copied");
      setTimeout(() => setState((s) => (s === "copied" ? "idle" : s)), 2500);
    } catch {
      setState("failed");
    }
  }

  async function join() {
    setBusy(true);
    setState("idle");
    try {
      await register(workshopId);
    } catch {
      setState("registerFailed");
    } finally {
      setBusy(false);
    }
  }

  if (query.isPending) return null;
  return (
    <span className="grid gap-1">
      {link ? (
        <Button type="button" variant="outline" onClick={() => void copy(link.link)} data-testid={`${testId}-copy`}>
          {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />} {state === "copied" ? t("copied") : t("copy")}
        </Button>
      ) : (
        <Button type="button" variant="outline" disabled={busy} onClick={() => void join()} data-testid={`${testId}-register`}>
          <Share2 aria-hidden /> {busy ? t("registering") : t("register")}
        </Button>
      )}
      {state === "failed" ? <span role="alert" className="text-xs text-red-700">{t("copyFailed")}</span> : null}
      {state === "registerFailed" ? <span role="alert" className="text-xs text-red-700">{t("failed")}</span> : null}
    </span>
  );
}

/** Under the name of a workshop: the affiliate fee of its shop and, once registered, what the link earned. */
export function AffiliateFeeLine({ workshopId }: { workshopId: string }) {
  const t = useTranslations("customer.affiliate");
  const locale = useLocale() as Locale;
  const { byWorkshop, rates, shopOfWorkshop } = useAffiliates();
  const link = byWorkshop.get(workshopId);
  const bps = link?.referralBps ?? rates[shopOfWorkshop[workshopId] ?? ""];
  if (bps === undefined) return null;
  const percent = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 2 }).format(bps / 10_000);
  return (
    <div className="grid gap-0.5 text-sm" data-testid="affiliate-fee-line">
      <p className="font-medium text-[var(--site-text)]">{t("fee", { rate: percent })}</p>
      {link ? <p className="text-xs text-[var(--site-muted)]">{t("earned", { amount: formatMoney(link.referralFee, link.currency, locale), count: link.bookings, clicks: link.clicks })}</p> : null}
    </div>
  );
}

/** At the top of the Affiliate page: how it works and the affiliate fee earned so far (one figure for each currency). */
export function AffiliateSummary() {
  const t = useTranslations("customer.affiliate");
  const locale = useLocale() as Locale;
  const { query } = useAffiliates();
  const totals = useMemo(() => {
    const by = new Map<string, number>();
    for (const r of query.data?.items ?? []) by.set(r.currency, (by.get(r.currency) ?? 0) + r.referralFee);
    return [...by];
  }, [query.data]);
  const count = (query.data?.items ?? []).length;
  return (
    <section aria-labelledby="aff-total" className="grid gap-1 rounded-xl border bg-card p-4" data-testid="affiliate-summary">
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <h2 id="aff-total" className="mt-1 text-sm font-medium">{t("totalTitle")}</h2>
      <p className="text-2xl font-semibold tabular-nums" data-testid="affiliate-total">
        {totals.length === 0 ? "—" : totals.map(([currency, amount]) => formatMoney(amount, currency, locale)).join(" · ")}
      </p>
      <p className="text-xs text-muted-foreground">{t("totalHint", { count })}</p>
    </section>
  );
}

export type { CustomerReferral };
