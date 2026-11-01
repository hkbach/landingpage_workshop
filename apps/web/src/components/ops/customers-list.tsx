"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Booking, Customer } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { Field } from "./field";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/** FR-CUST-01: per-shop customers, search by name / email. */
export function CustomersList({ customers, bookings, timezone }: { customers: Customer[]; bookings: Booking[]; timezone: string }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = customers
    .filter((c) => !q || c.fullName.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))
    .map((c) => {
      const mine = bookings.filter((b) => b.customerId === c.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      const spent = mine.reduce((n, b) => n + b.payments.reduce((m, p) => m + (p.type === "PAYMENT" ? p.amount : -p.amount), 0), 0);
      return { c, count: mine.length, last: mine[0], spent, currency: mine[0]?.currency };
    });

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t("customers.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("customers.perShop")}</p>
      <Card>
        <CardContent>
          <form role="search" onSubmit={(e) => e.preventDefault()} className="max-w-md">
            <Field id="c-q" label={t("filters.search")}>
              {(p) => (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input {...p} type="search" className="h-9 pl-8" placeholder={t("customers.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              )}
            </Field>
          </form>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground" role="status">{t("customers.count", { count: rows.length })}</p>
      {rows.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">{t("customers.empty")}</CardContent></Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("customers.name")}</TableHead>
                <TableHead>{t("customers.email")}</TableHead>
                <TableHead>{t("customers.country")}</TableHead>
                <TableHead>{t("customers.bookings")}</TableHead>
                <TableHead>{t("customers.lastBooking")}</TableHead>
                <TableHead className="text-right">{t("customers.paid")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ c, count, last, spent, currency }) => (
                <TableRow key={c.id}>
                  <TableCell><ShopLink href={`/shopowner/customers/${c.id}`} className="font-medium underline-offset-4 hover:underline">{c.fullName}</ShopLink></TableCell>
                  <TableCell>{c.email ?? t("common.noEmail")}</TableCell>
                  <TableCell>{c.country}</TableCell>
                  <TableCell>{count}</TableCell>
                  <TableCell>{last ? formatDate(last.startsAt, timezone, locale) : "-"}</TableCell>
                  <TableCell className="text-right">{currency ? formatMoney(spent, currency, locale) : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
