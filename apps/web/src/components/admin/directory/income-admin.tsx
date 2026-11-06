"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import type { Income } from "@/lib/mock/admin-income";
import { DirectoryTable, FilterBox, type Column } from "./kit";

type ShopRow = Income["shops"][number];

/**
 * The income of the platform: the fees charged on the bookings of every shop (maintenance and service, at the rates of each shop), less the referral fees paid for the
 * bookings that came through referral links. Profit of the platform = total fees - referral fees.
 */
export function IncomeAdmin() {
  const t = useTranslations("admin.income");
  const locale = useLocale();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const bad = Boolean(from && to && from > to);
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to && !bad ? { to } : {}) }).toString();
  const [data, setData] = useState<{ qs: string; income: Income | null } | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/admin/income${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Income>) : Promise.reject(new Error("failed"))))
      .then((income) => { if (live) setData({ qs, income }); })
      .catch(() => { if (live) setData({ qs, income: null }); });
    return () => { live = false; };
  }, [qs]);
  const fresh = data?.qs === qs;
  const income = fresh ? data.income : (data?.income ?? null);
  const error = fresh && data.income === null;
  const money = (n: number, currency: string) => formatMoney(n, currency, locale);

  const columns: Column<ShopRow>[] = [
    { key: "shop", header: t("col.shop"), cell: (s) => <span className="font-medium">{s.shopName}</span> },
    { key: "bookings", header: t("col.bookings"), className: "text-right tabular-nums", cell: (s) => s.bookings },
    { key: "income", header: t("col.income"), className: "text-right tabular-nums", cell: (s) => money(s.income, s.currency) },
    { key: "base", header: t("col.basePrice"), className: "text-right tabular-nums", cell: (s) => money(s.basePrice, s.currency) },
    { key: "maintenance", header: t("col.maintenance"), className: "text-right tabular-nums", cell: (s) => money(s.maintenanceFee, s.currency) },
    { key: "service", header: t("col.service"), className: "text-right tabular-nums", cell: (s) => money(s.serviceFee, s.currency) },
    { key: "fees", header: t("col.fees"), className: "text-right tabular-nums", cell: (s) => money(s.fees, s.currency) },
    { key: "referral", header: t("col.referral"), className: "text-right tabular-nums", cell: (s) => `−${money(s.referralFee, s.currency)}` },
    { key: "profit", header: t("col.profit"), className: "text-right tabular-nums font-semibold", cell: (s) => money(s.profit, s.currency) },
  ];

  return (
    <div className="grid gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <FilterBox id="inc-from" label={t("from")}><DateInput id="inc-from" value={from} onChange={setFrom} max={to || undefined} lenient /></FilterBox>
        <FilterBox id="inc-to" label={t("to")}><DateInput id="inc-to" value={to} onChange={setTo} min={from || undefined} lenient /></FilterBox>
        {from || to ? <Button type="button" variant="outline" onClick={() => { setFrom(""); setTo(""); }}>{t("clearDates")}</Button> : null}
      </div>
      {bad ? <p role="alert" className="text-sm text-destructive">{t("dateOrder")}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="income-totals">
        {(income?.totals ?? []).map((tot) => (
          <Card key={tot.currency}>
            <CardHeader>
              <CardTitle className="text-base">{t("totalIn", { currency: tot.currency })}</CardTitle>
              <CardDescription>{t("formula")}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <div className="flex justify-between"><span>{t("col.income")}</span><span className="tabular-nums">{money(tot.income, tot.currency)}</span></div>
              <div className="flex justify-between"><span>{t("totalBase")}</span><span className="tabular-nums">{money(tot.basePrice, tot.currency)}</span></div>
              <div className="flex justify-between"><span>{t("totalFees")}</span><span className="tabular-nums" data-testid="total-fees">{money(tot.fees, tot.currency)}</span></div>
              <div className="flex justify-between"><span>{t("col.referral")}</span><span className="tabular-nums" data-testid="total-referral">−{money(tot.referralFee, tot.currency)}</span></div>
              <div className="flex justify-between border-t pt-1 font-semibold"><span>{t("col.profit")}</span><span className="tabular-nums" data-testid="total-profit">{money(tot.profit, tot.currency)}</span></div>
            </CardContent>
          </Card>
        ))}
      </div>
      <DirectoryTable rows={income?.shops ?? null} error={error} columns={columns} rowKey={(s) => s.shopId} resetKey={qs} testId="income-table" />
      <p className="text-xs text-muted-foreground">{t("note")}</p>
    </div>
  );
}
