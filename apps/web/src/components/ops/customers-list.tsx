"use client";

import { Fragment, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, ChevronRight, Eye, Search } from "lucide-react";
import { formatMoney, GENDERS } from "@workshop/shared";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PaginationBar } from "@/components/ui/pagination-bar";
import { usePagination } from "@/lib/pagination";
import type { Booking, Customer } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Field } from "./field";
import { NativeSelect } from "./native-select";
import { CustomerAvatar } from "./customer-avatar";
import { CustomerBookingsTable } from "./customer-bookings-table";
import { CustomerDialog } from "./customer-dialog";
import { SortableHead } from "./sortable-head";
import { nextSort, sortRows, type SortState } from "@/lib/table-sort";
import { matchesSearch } from "@/lib/text-search";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/**
 * FR-CUST-01: the customers of the shop are the guests of its bookings (a person with no booking is not listed), searched by name / email. A click on
 * a row opens the list of every booking that customer has made (cancelled ones too), the one made most recently first. The search looks in the
 * name and the email; two filters narrow the list to a country (or Guest: no account) and to a gender (or not provided).
 */
export function CustomersList({ customers, bookings, timezone }: { customers: Customer[]; bookings: Booking[]; timezone: string }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  // Country and birth date come from the account of the customer; a guest who only booked has no account (the country reads "Guest", the date "-").
  const regionName = new Intl.DisplayNames([locale], { type: "region" });
  const birthDay = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState(""); // "": every country; GUEST: customers with no account; otherwise a country code
  const [gender, setGender] = useState(""); // "": every gender; NONE: not given; otherwise a gender
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const [viewing, setViewing] = useState<string | null>(null); // the customer whose popup is open
  const [sort, setSort] = useState<SortState>(null); // none: the most recent booking first
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = customers
    .map((c) => {
      // The bookings of the customer, the one made most recently first.
      const mine = bookings.filter((b) => b.customerId === c.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
      const spent = mine.reduce((n, b) => n + b.payments.reduce((m, p) => m + (p.type === "PAYMENT" ? p.amount : -p.amount), 0), 0);
      return { c, mine, count: mine.length, last: mine[0], spent, currency: mine[0]?.currency };
    })
    .filter((r) => r.count > 0)
    .sort((a, b) => b.last!.createdAt.localeCompare(a.last!.createdAt) || a.c.fullName.localeCompare(b.c.fullName));
  // What the customer is shown as (the search looks in it): the gender and the country are the words of the language of the page.
  const genderOf = (c: Customer) => (c.account?.gender ? t(`customers.genders.${c.account.gender}`) : null);
  const countryOf = (c: Customer) => (c.account ? regionName.of(c.account.country) ?? c.account.country : t("customers.guest"));
  // The country filter offers the countries of the customers (and Guest when some have no account); the gender filter the genders and "not provided".
  const countryCodes = [...new Set(all.flatMap((r) => (r.c.account ? [r.c.account.country] : [])))].sort((a, b) => (regionName.of(a) ?? a).localeCompare(regionName.of(b) ?? b, locale));
  const hasGuests = all.some((r) => !r.c.account);
  const countryKey = (c: Customer) => (c.account ? c.account.country : "GUEST");
  const genderKey = (c: Customer) => c.account?.gender ?? "NONE";
  const found = all
    .filter((r) => matchesSearch(`${r.c.fullName} ${r.c.email ?? ""}`, query))
    .filter((r) => !country || countryKey(r.c) === country)
    .filter((r) => !gender || genderKey(r.c) === gender);
  // What each column is sorted by (a guest with no account has no country and no birth date: those rows go last).
  const sorted = sortRows(found, sort, (r, key) => {
    switch (key) {
      case "name": return r.c.fullName;
      case "email": return r.c.email;
      case "country": return r.c.account ? countryOf(r.c) : null;
      case "gender": return genderOf(r.c);
      case "birth": return r.c.account?.birthDate;
      case "bookings": return r.count;
      case "last": return r.last?.createdAt;
      case "paid": return r.spent;
      default: return null;
    }
  }, locale);
  const pg = usePagination(sorted, [query, country, gender, JSON.stringify(sort)].join("|"));
  const rows = pg.items;

  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">{t("customers.title")}</h1>
      <p className="text-sm text-muted-foreground">{t("customers.perShop")}</p>
      <p className="text-sm text-muted-foreground" data-testid="customers-guest-hint">{t("customers.guestHint")}</p>
      <Card>
        <CardContent>
          <form role="search" onSubmit={(e) => e.preventDefault()} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field id="c-q" label={t("filters.search")}>
              {(p) => (
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
                  <Input {...p} type="search" className="h-9 pl-8" placeholder={t("customers.searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
              )}
            </Field>
            <Field id="c-country" label={t("customers.country")}>
              {(p) => (
                <NativeSelect {...p} value={country} onChange={(e) => setCountry(e.target.value)}
                  options={[
                    { value: "", label: t("customers.allCountries") },
                    ...countryCodes.map((code) => ({ value: code, label: regionName.of(code) ?? code })),
                    ...(hasGuests ? [{ value: "GUEST", label: t("customers.guest") }] : []),
                  ]} />
              )}
            </Field>
            <Field id="c-gender" label={t("customers.gender")}>
              {(p) => (
                <NativeSelect {...p} value={gender} onChange={(e) => setGender(e.target.value)}
                  options={[
                    { value: "", label: t("customers.allGenders") },
                    ...GENDERS.map((g) => ({ value: g, label: t(`customers.genders.${g}`) })),
                    { value: "NONE", label: t("customers.genderNone") },
                  ]} />
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
                <SortableHead label={t("customers.name")} sortKey="name" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <SortableHead label={t("customers.email")} sortKey="email" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <SortableHead label={t("customers.country")} sortKey="country" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <SortableHead label={t("customers.birthDate")} sortKey="birth" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <SortableHead label={t("customers.gender")} sortKey="gender" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <SortableHead label={t("customers.bookings")} sortKey="bookings" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <SortableHead label={t("customers.lastBooking")} sortKey="last" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <SortableHead label={t("customers.paid")} sortKey="paid" align="right" sort={sort} onSort={(k) => setSort((s) => nextSort(s, k))} />
                <TableHead className="w-12"><span className="sr-only">{t("customers.details")}</span></TableHead>
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
                      <TableCell className="font-medium">
                        <span className="flex items-center gap-2.5">
                          <CustomerAvatar name={c.fullName} url={c.account?.avatarUrl} />
                          {c.fullName}
                        </span>
                      </TableCell>
                      <TableCell>{c.email ?? t("common.noEmail")}</TableCell>
                      <TableCell data-testid="customer-country">{c.account ? regionName.of(c.account.country) ?? c.account.country : t("customers.guest")}</TableCell>
                      <TableCell data-testid="customer-birth">{c.account ? birthDay(c.account.birthDate) : "-"}</TableCell>
                      <TableCell data-testid="customer-gender">{genderOf(c) ?? "-"}</TableCell>
                      <TableCell>{count}</TableCell>
                      <TableCell>{formatDate(last!.createdAt, timezone, locale)}</TableCell>
                      <TableCell className="text-right">{currency ? formatMoney(spent, currency, locale) : "-"}</TableCell>
                      <TableCell>
                        <button
                          type="button" data-testid="customer-view" title={t("customers.viewDetailsOf", { name: c.fullName })} aria-label={t("customers.viewDetailsOf", { name: c.fullName })}
                          onClick={() => setViewing(c.id)}
                          className="flex size-7 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                        >
                          <Eye className="size-4" aria-hidden="true" />
                        </button>
                      </TableCell>
                    </TableRow>
                    {isOpen ? (
                      <TableRow data-testid="customer-bookings" className="bg-muted/20 hover:bg-muted/20">
                        <TableCell />
                        <TableCell colSpan={9} className="whitespace-normal py-3">
                          <div id={panelId} className="grid gap-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium">{t("customers.history")} · {t("customers.count2", { count })}</p>
                              <ShopLink href={`/shopowner/customers/${c.id}`} className="text-xs text-primary underline-offset-4 hover:underline">{t("customers.viewCustomer")}</ShopLink>
                            </div>
                            <CustomerBookingsTable bookings={mine} timezone={timezone} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
          <PaginationBar {...pg.bar} />
        </Card>
      )}
      {viewing ? (() => {
        const r = all.find((x) => x.c.id === viewing);
        return r ? <CustomerDialog customer={r.c} bookings={r.mine} timezone={timezone} open onOpenChange={(o) => { if (!o) setViewing(null); }} /> : null;
      })() : null}
    </div>
  );
}
