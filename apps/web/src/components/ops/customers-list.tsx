"use client";

import { Fragment, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Booking, Customer } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Field } from "./field";
import { BookingStatusBadge, PaymentStatusBadge } from "./status-badges";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/**
 * FR-CUST-01: the customers of the shop are the guests of its bookings (a person with no booking is not listed), searched by name / email. A click on
 * a row opens the list of every booking that customer has made (cancelled ones too), newest first.
 */
export function CustomersList({ customers, bookings, timezone }: { customers: Customer[]; bookings: Booking[]; timezone: string }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const q = query.trim().toLowerCase();
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const rows = customers
    .map((c) => {
      const mine = bookings.filter((b) => b.customerId === c.id).sort((a, b) => b.startsAt.localeCompare(a.startsAt));
      const spent = mine.reduce((n, b) => n + b.payments.reduce((m, p) => m + (p.type === "PAYMENT" ? p.amount : -p.amount), 0), 0);
      return { c, mine, count: mine.length, last: mine[0], spent, currency: mine[0]?.currency };
    })
    .filter((r) => r.count > 0)
    .filter((r) => !q || r.c.fullName.toLowerCase().includes(q) || r.c.email?.toLowerCase().includes(q))
    .sort((a, b) => b.last!.startsAt.localeCompare(a.last!.startsAt) || a.c.fullName.localeCompare(b.c.fullName));

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
          <Table data-testid="customers-table">
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><span className="sr-only">{t("customers.history")}</span></TableHead>
                <TableHead>{t("customers.name")}</TableHead>
                <TableHead>{t("customers.email")}</TableHead>
                <TableHead>{t("customers.country")}</TableHead>
                <TableHead>{t("customers.bookings")}</TableHead>
                <TableHead>{t("customers.lastBooking")}</TableHead>
                <TableHead className="text-right">{t("customers.paid")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ c, mine, count, last, spent, currency }) => {
                const isOpen = open.has(c.id);
                const panelId = `cust-${c.id}-bookings`;
                return (
                  <Fragment key={c.id}>
                    <TableRow
                      data-testid="customer-row" data-state={isOpen ? "open" : "closed"} className={cn("cursor-pointer", isOpen && "bg-muted/40")}
                      onClick={(e) => { if (!(e.target as HTMLElement).closest("button, a")) toggle(c.id); }}
                    >
                      <TableCell>
                        <button
                          type="button" aria-expanded={isOpen} aria-controls={isOpen ? panelId : undefined} data-testid="customer-toggle"
                          aria-label={t(isOpen ? "customers.hideBookings" : "customers.showBookings", { name: c.fullName })}
                          onClick={() => toggle(c.id)}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          {isOpen ? <ChevronDown className="size-4" aria-hidden="true" /> : <ChevronRight className="size-4" aria-hidden="true" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{c.fullName}</TableCell>
                      <TableCell>{c.email ?? t("common.noEmail")}</TableCell>
                      <TableCell>{c.country}</TableCell>
                      <TableCell>{count}</TableCell>
                      <TableCell>{formatDate(last!.startsAt, timezone, locale)}</TableCell>
                      <TableCell className="text-right">{currency ? formatMoney(spent, currency, locale) : "-"}</TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow data-testid="customer-bookings" className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={6} className="whitespace-normal py-3">
                          <div id={panelId} className="grid gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium">{t("customers.history")} · {t("customers.count2", { count })}</p>
                              <ShopLink href={`/shopowner/customers/${c.id}`} className="text-xs text-primary underline-offset-4 hover:underline">{t("customers.viewCustomer")}</ShopLink>
                            </div>
                            <div className="overflow-x-auto rounded-lg border bg-background">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>{t("bookings.code")}</TableHead>
                                    <TableHead>{t("bookings.workshop")}</TableHead>
                                    <TableHead>{t("bookings.session")}</TableHead>
                                    <TableHead>{t("bookings.status")}</TableHead>
                                    <TableHead>{t("bookings.payment")}</TableHead>
                                    <TableHead className="text-right">{t("payment.total")}</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {mine.map((b) => (
                                    <TableRow key={b.id} data-testid="customer-booking">
                                      <TableCell><ShopLink href={`/shopowner/bookings/${b.id}`} className="font-mono font-medium underline-offset-4 hover:underline">{b.bookingCode}</ShopLink></TableCell>
                                      <TableCell>{b.workshopTitle}</TableCell>
                                      <TableCell className="whitespace-nowrap">{formatDateTime(b.startsAt, timezone, locale)}</TableCell>
                                      <TableCell><BookingStatusBadge status={b.status} /></TableCell>
                                      <TableCell><PaymentStatusBadge status={b.paymentStatus} /></TableCell>
                                      <TableCell className="text-right">{formatMoney(b.totalAmount, b.currency, locale)}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
