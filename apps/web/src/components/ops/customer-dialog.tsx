"use client";

import { useLocale, useTranslations } from "next-intl";
import { formatMoney, socialEntries } from "@workshop/shared";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Booking, Customer } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { CustomerAvatar } from "./customer-avatar";
import { CustomerBookingsTable } from "./customer-bookings-table";

/**
 * The details of one customer as a popup over the customers list: who they are (email, phone, country and birth date from their account, language),
 * how much they booked and paid, and every booking they have made (the one made most recently first, cancelled ones too).
 */
export function CustomerDialog({ customer, bookings, timezone, open, onOpenChange }: {
  customer: Customer; bookings: Booking[]; timezone: string; open: boolean; onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        {/* Mounted only while the popup is open. */}
        {open ? <Content customer={customer} bookings={bookings} timezone={timezone} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Content({ customer, bookings, timezone }: { customer: Customer; bookings: Booking[]; timezone: string }) {
  const t = useTranslations("ops");
  const locale = useLocale();
  const region = new Intl.DisplayNames([locale], { type: "region" });
  const language = new Intl.DisplayNames([locale], { type: "language" });
  const day = (d: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
  const paid = bookings.reduce((n, b) => n + b.payments.reduce((m, p) => m + (p.type === "PAYMENT" ? p.amount : -p.amount), 0), 0);
  const currency = bookings[0]?.currency;
  const first = bookings[bookings.length - 1];
  // The chat and social accounts the customer gave with their account (none for a guest who only booked).
  const socials = socialEntries(customer.account?.socials);
  return (
    <div className="grid gap-4" data-testid="customer-dialog">
      <DialogHeader className="flex-row items-center gap-4">
        {/* The avatar area: the picture of the account, or the initials of a guest who only booked. */}
        <CustomerAvatar name={customer.fullName} url={customer.account?.avatarUrl} className="size-16 text-xl" />
        <div className="grid gap-1">
          <DialogTitle>{customer.fullName}</DialogTitle>
          <DialogDescription>{t("customers.perShop")}</DialogDescription>
        </div>
      </DialogHeader>
      <section aria-label={t("customers.details")} className="grid gap-2">
        <h3 className="text-sm font-medium">{t("customers.details")}</h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-muted-foreground">{t("customers.email")}</dt><dd>{customer.email ?? t("common.noEmail")}</dd>
          <dt className="text-muted-foreground">{t("customers.phone")}</dt><dd>{customer.phone ?? "-"}</dd>
          <dt className="text-muted-foreground">{t("customers.country")}</dt>
          <dd data-testid="dialog-country">{customer.account ? region.of(customer.account.country) ?? customer.account.country : t("customers.guest")}</dd>
          <dt className="text-muted-foreground">{t("customers.birthDate")}</dt>
          <dd data-testid="dialog-birth">{customer.account ? day(customer.account.birthDate) : "-"}</dd>
          <dt className="text-muted-foreground">{t("customers.gender")}</dt>
          <dd data-testid="dialog-gender">{customer.account?.gender ? t(`customers.genders.${customer.account.gender}`) : "-"}</dd>
          <dt className="text-muted-foreground">{t("customers.locale")}</dt><dd>{language.of(customer.preferredLocale) ?? customer.preferredLocale}</dd>
          <dt className="text-muted-foreground">{t("customers.bookings")}</dt>
          <dd>{bookings.length}{first ? <span className="text-muted-foreground"> · {t("customers.firstBooking", { date: formatDate(first.createdAt, timezone, locale) })}</span> : null}</dd>
          <dt className="text-muted-foreground">{t("customers.paid")}</dt><dd>{currency ? formatMoney(paid, currency, locale) : "-"}</dd>
          <dt className="text-muted-foreground">{t("customers.socials")}</dt>
          <dd className="sm:col-span-3" data-testid="dialog-socials">
            {socials.length === 0 ? "-" : (
              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                {socials.map(([platform, handle]) => (
                  <li key={platform}><span className="text-muted-foreground">{t(`customers.social.${platform}`)}:</span> <span className="[overflow-wrap:anywhere]">{handle}</span></li>
                ))}
              </ul>
            )}
          </dd>
        </dl>
      </section>
      <section aria-label={t("customers.history")} className="grid gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium">{t("customers.history")} · {t("customers.count2", { count: bookings.length })}</h3>
          <p className="text-xs text-muted-foreground">{t("common.tzNote", { tz: timezone })}</p>
        </div>
        {bookings.length === 0 ? <p className="text-sm text-muted-foreground">{t("customers.noHistory")}</p> : <CustomerBookingsTable bookings={bookings} timezone={timezone} />}
      </section>
    </div>
  );
}
