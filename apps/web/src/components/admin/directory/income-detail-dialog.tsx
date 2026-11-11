"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatMoney } from "@workshop/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ShopIncomeDetail } from "@/lib/mock/admin-income";
import { usePagination } from "@/lib/pagination";
import { fmt } from "../utils";
import { Pill } from "./kit";

/**
 * The income of one shop in detail: the statement of each month (what the system closes at the end of the month and the shop pays by the invoice of the platform; sending invoices comes later) and every
 * payment the shop recorded with the maintenance fee, the service fee and the affiliate fee taken from it. A payment recorded by mistake and undone shows as a reversal.
 */
export function IncomeDetailDialog({ shop, from, to, onClose }: { shop: { id: string; name: string } | null; from: string; to: string; onClose: () => void }) {
  return (
    <Dialog open={shop !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">{shop ? <Body key={shop.id} shop={shop} from={from} to={to} /> : null}</DialogContent>
    </Dialog>
  );
}

function Body({ shop, from, to }: { shop: { id: string; name: string }; from: string; to: string }) {
  const t = useTranslations("admin.income.detail");
  const locale = useLocale();
  const [data, setData] = useState<ShopIncomeDetail | null | "error">(null);
  const qs = new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString();
  useEffect(() => {
    let live = true;
    fetch(`/api/v1/admin/income/${encodeURIComponent(shop.id)}${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<ShopIncomeDetail>) : Promise.reject(new Error("failed"))))
      .then((d) => { if (live) setData(d); })
      .catch(() => { if (live) setData("error"); });
    return () => { live = false; };
  }, [shop.id, qs]);
  const lines = data && data !== "error" ? data.lines : [];
  const pg = usePagination(lines, `${from}|${to}`);
  const money = (n: number) => formatMoney(n, data && data !== "error" ? data.currency : "VND", locale);
  const monthLabel = (m: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T12:00:00Z`));

  return (
    <div className="grid gap-5" data-testid="income-detail">
      <DialogHeader>
        <DialogTitle>{t("title", { shop: shop.name })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      {data === null ? <p role="status" className="text-sm text-muted-foreground">{t("loading")}</p> : data === "error" ? <p role="alert" className="text-sm text-destructive">{t("error")}</p> : (
        <>
          <section className="grid gap-2" aria-labelledby="income-months">
            <h3 id="income-months" className="font-semibold">{t("monthsTitle")}</h3>
            <p className="text-xs text-muted-foreground">{t("monthsNote")}</p>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("col.month")}</TableHead><TableHead className="text-right">{t("col.payments")}</TableHead><TableHead className="text-right">{t("col.income")}</TableHead>
                  <TableHead className="text-right">{t("col.maintenance")}</TableHead><TableHead className="text-right">{t("col.service")}</TableHead><TableHead className="text-right">{t("col.invoice")}</TableHead>
                  <TableHead className="text-right">{t("col.referral")}</TableHead><TableHead className="text-right">{t("col.inviteBonus")}</TableHead><TableHead className="text-right">{t("col.profit")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.months.length === 0 ? <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground" data-testid="income-months-empty">{t("empty")}</TableCell></TableRow> : data.months.map((m) => (
                    <TableRow key={m.month} data-testid="income-month">
                      <TableCell className="font-medium">{monthLabel(m.month)}</TableCell><TableCell className="text-right tabular-nums">{m.payments}</TableCell><TableCell className="text-right tabular-nums">{money(m.income)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(m.maintenanceFee)}</TableCell><TableCell className="text-right tabular-nums">{money(m.serviceFee)}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(m.fees)}</TableCell>
                      <TableCell className="text-right tabular-nums">−{money(m.referralFee)}</TableCell><TableCell className="text-right tabular-nums">−{money(m.inviteBonus)}</TableCell><TableCell className="text-right font-semibold tabular-nums">{money(m.profit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
          <section className="grid gap-2" aria-labelledby="income-lines">
            <h3 id="income-lines" className="font-semibold">{t("linesTitle")}</h3>
            <div className="overflow-hidden rounded-xl border">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("col.date")}</TableHead><TableHead>{t("col.booking")}</TableHead><TableHead>{t("col.kind")}</TableHead><TableHead className="text-right">{t("col.paid")}</TableHead><TableHead className="text-right">{t("col.basePrice")}</TableHead>
                  <TableHead className="text-right">{t("col.maintenance")}</TableHead><TableHead className="text-right">{t("col.service")}</TableHead><TableHead className="text-right">{t("col.referral")}</TableHead><TableHead className="text-right">{t("col.profit")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {lines.length === 0 ? <TableRow><TableCell colSpan={9} className="py-6 text-center text-muted-foreground" data-testid="income-lines-empty">{t("empty")}</TableCell></TableRow> : pg.items.map((l) => (
                    <TableRow key={l.id} data-testid="income-line">
                      <TableCell className="whitespace-nowrap">{fmt(l.occurredAt, locale)}</TableCell><TableCell className="font-mono text-xs">{l.bookingCode}</TableCell>
                      <TableCell><Pill tone={l.kind === "PAYMENT" ? "green" : "amber"}>{t(`kind.${l.kind}`)}</Pill></TableCell>
                      <TableCell className="text-right tabular-nums">{money(l.amount)}</TableCell><TableCell className="text-right tabular-nums">{money(l.basePrice)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(l.maintenanceFee)}</TableCell><TableCell className="text-right tabular-nums">{money(l.serviceFee)}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.referred ? `−${money(l.referralFee)}` : "—"}</TableCell><TableCell className="text-right font-medium tabular-nums">{money(l.profit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <PaginationBar {...pg.bar} />
          </section>
        </>
      )}
    </div>
  );
}
