"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CalendarClock, CalendarDays, CheckCircle2, Clock, Gift, Heart, MapPin, Sparkles, Ticket, Users, Wallet } from "lucide-react";
import { formatMoney, pickLocalized, type Locale } from "@workshop/shared";
import { Button } from "@/components/ui/button";
import { checkInBlock, checkInOpensAt, summarize, whenOf, type CustomerBooking, type When } from "@/lib/customer-bookings";
import { dayPart, needsAttention, todaysBookings, weekAhead } from "@/lib/customer-today";
import { fetchCustomerBookings, fetchCustomerInvites, fetchCustomerWallet } from "@/lib/customer-api";
import { safeMaps } from "@/components/sections/safe-url";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CheckInBooking } from "./check-in-booking";
import { useCustomer } from "./customer-shell";
import { GoogleMapsButton } from "./google-maps-button";

/**
 * Today: what matters to the guest now, on a phone first. A greeting; the workshops of today (with Check-in and the way there); what needs the guest (a booking to confirm,
 * one to pay); what is coming in the next 7 days; a few figures (upcoming, attended, what can be withdrawn); the favorite categories with a way to the workshops; and the invitation
 * of friends. Everything comes from the same data as the other pages of the area.
 */
export function CustomerToday() {
  const t = useTranslations("customer");
  const tt = useTranslations("customer.today");
  const tb = useTranslations("customer.bookings");
  const locale = useLocale() as Locale;
  const { accountId, email, profile } = useCustomer();
  const queryClient = useQueryClient();
  const who = email ?? "no-login";
  const bookingsKey = ["customer-bookings", accountId, who];
  const bookings = useQuery({ queryKey: bookingsKey, queryFn: () => fetchCustomerBookings(accountId, email), retry: false });
  const affiliate = useQuery({ queryKey: ["customer-today-wallet", accountId, who, "AFFILIATE"], queryFn: () => fetchCustomerWallet(accountId, email, "AFFILIATE"), retry: false });
  const referral = useQuery({ queryKey: ["customer-today-wallet", accountId, who, "REFERRAL"], queryFn: () => fetchCustomerWallet(accountId, email, "REFERRAL"), retry: false });
  const invites = useQuery({ queryKey: ["customer-invites", accountId, who], queryFn: () => fetchCustomerInvites(accountId, email), retry: false });
  const base = `/customer/${encodeURIComponent(accountId)}`;

  if (bookings.isPending) return <p role="status" aria-busy="true" className="text-sm text-muted-foreground">{t("shell.loading")}</p>;
  if (bookings.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-3" data-testid="customer-today-failed">
        <p className="text-sm text-destructive">{tt("failed")}</p>
        <Button onClick={() => void bookings.refetch()}>{t("gate.retry")}</Button>
      </div>
    );
  }

  const all = bookings.data.bookings;
  const now = new Date(bookings.data.now);
  const todays = todaysBookings(all, now);
  const week = weekAhead(all, now);
  const attention = needsAttention(all, now);
  const summary = summarize(all, now);
  const firstName = profile.fullName.trim().split(/\s+/)[0] ?? profile.fullName;
  const dateLine = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(now);
  const title = (b: CustomerBooking) => pickLocalized(b.workshopTitle, locale, b.shop.defaultLocale as Locale);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: bookingsKey });
  const favorites = profile.account.favoriteCategories;
  const next = week[0];

  return (
    <div className="grid gap-5" data-testid="customer-today">
      {/* The greeting and the day. */}
      <header className="rounded-3xl bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100 p-5 sm:p-6">
        <p className="text-sm font-medium text-muted-foreground" data-testid="today-date">{dateLine}</p>
        <h1 className="mt-1 text-2xl font-semibold leading-tight" data-testid="today-greeting">{tt(`greeting.${dayPart(now.getHours())}`, { name: firstName })}</h1>
        <p className="mt-1 text-sm text-foreground/80" data-testid="today-summary">
          {todays.length > 0 ? tt("summaryToday", { count: todays.length }) : next ? tt("summaryNext", { title: title(next), when: whenText(tb, whenOf(next, now)) }) : tt("summaryNone")}
        </p>
      </header>

      {/* The workshops of today. */}
      <Section icon={<CalendarClock className="size-4" aria-hidden />} title={tt("todayTitle")} id="today-workshops">
        {todays.length === 0 ? (
          <div className="grid justify-items-start gap-3 rounded-2xl border border-dashed bg-background p-5" data-testid="today-none">
            <p className="text-sm text-muted-foreground">{tt("noneToday")}</p>
            <Link href={`${base}/workshops`} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">{tt("browse")}</Link>
          </div>
        ) : (
          <ul className="grid gap-3" data-testid="today-list">
            {todays.map((b) => {
              const when = whenOf(b, now);
              const block = checkInBlock(b, now);
              const maps = safeMaps(b.directionsUrl);
              return (
                <li key={b.id} data-testid="today-item" data-code={b.code} className={cn("grid gap-2 rounded-2xl border bg-background p-4 shadow-sm", when.kind === "inProgress" && "ring-2 ring-emerald-400")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums"><Clock className="size-4 text-muted-foreground" aria-hidden />{formatTime(b.startsAt, b.timezone, locale)} – {formatTime(b.endsAt, b.timezone, locale)}</span>
                    <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold", when.kind === "inProgress" ? "bg-emerald-500 text-white" : when.kind === "finished" ? "bg-slate-100 text-slate-700" : "bg-sky-100 text-sky-800")}>
                      {when.kind === "inProgress" ? tt("now") : when.kind === "finished" ? tb("when.finished") : tt("later")}
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{tb(`status.${b.status}`)}</span>
                  </div>
                  <h3 className="text-base font-semibold leading-snug">{title(b)}</h3>
                  <p className="text-sm text-muted-foreground">{tb("shopLine", { shop: b.shop.name })} · <span className="inline-flex items-center gap-1"><Users className="size-3.5" aria-hidden />{tb("guests", { count: b.quantity })}</span></p>
                  {b.address ? <p className="flex items-start gap-1.5 text-sm"><MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />{b.address}</p> : null}
                  {b.status === "CHECKED_IN" ? (
                    <p className="flex items-center gap-1.5 text-sm font-medium text-indigo-700"><CheckCircle2 className="size-4" aria-hidden />{tb("checkedInAt", { time: formatTime(b.checkedInAt ?? b.startsAt, b.timezone, locale) })}</p>
                  ) : when.kind === "finished" ? null : (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <CheckInBooking code={b.code} enabled={b.canCheckIn} onCheckedIn={refresh} />
                      {maps ? <GoogleMapsButton href={maps} testId="today-map" /> : null}
                    </div>
                  )}
                  {b.status !== "CHECKED_IN" && block && block !== "cancelled" ? <p className="text-xs text-muted-foreground">{tb(`checkInBlocked.${block}`, { time: formatTime(checkInOpensAt(b), b.timezone, locale) })}</p> : null}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* What waits for the guest. */}
      {attention.length > 0 ? (
        <Section icon={<AlertCircle className="size-4 text-amber-600" aria-hidden />} title={tt("attentionTitle")} id="today-attention">
          <ul className="grid gap-2" data-testid="today-attention-list">
            {attention.map(({ booking: b, kind }) => (
              <li key={b.id} data-kind={kind} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-950">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span className="grid gap-0.5">
                  <span className="font-medium">{title(b)} · {new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: b.timezone }).format(new Date(b.startsAt))}</span>
                  <span>{kind === "confirm" ? tt("attention.confirm") : tt("attention.unpaid", { amount: formatMoney(b.totalAmount, b.currency, locale) })}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* The next 7 days. */}
      <Section icon={<CalendarDays className="size-4" aria-hidden />} title={tt("weekTitle")} id="today-week" action={<Link href={`${base}/bookings`} className="text-sm font-medium underline underline-offset-4">{tt("seeAll")}</Link>}>
        {week.length === 0 ? (
          <p className="rounded-2xl border border-dashed bg-background p-4 text-sm text-muted-foreground" data-testid="today-week-none">{tt("weekNone")}</p>
        ) : (
          <ul className="grid gap-2" data-testid="today-week-list">
            {week.map((b) => (
              <li key={b.id} className="flex items-center gap-3 rounded-2xl border bg-background p-3" data-testid="today-week-item">
                <span className="grid min-w-12 place-items-center rounded-xl bg-muted px-2 py-1 text-center" aria-hidden="true">
                  <span className="text-[0.65rem] font-semibold uppercase leading-none tracking-wide text-rose-600">{new Intl.DateTimeFormat(locale, { month: "short", timeZone: b.timezone }).format(new Date(b.startsAt))}</span>
                  <span className="text-lg font-bold leading-tight">{new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: b.timezone }).format(new Date(b.startsAt))}</span>
                </span>
                <span className="grid min-w-0 flex-1">
                  <span className="truncate text-sm font-semibold">{title(b)}</span>
                  <span className="truncate text-xs text-muted-foreground">{whenText(tb, whenOf(b, now))} · {formatTime(b.startsAt, b.timezone, locale)} · {b.shop.name}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* A few figures. */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={tt("figures")} data-testid="today-figures">
        <Figure href={`${base}/bookings`} icon={<Ticket className="size-5" aria-hidden />} tone="bg-emerald-100 text-emerald-700" value={String(summary.upcoming)} label={tt("upcoming")} />
        <Figure href={`${base}/bookings`} icon={<CheckCircle2 className="size-5" aria-hidden />} tone="bg-indigo-100 text-indigo-700" value={String(summary.attended)} label={tt("attended")} />
        <Figure href={`${base}/affiliate`} icon={<Wallet className="size-5" aria-hidden />} tone="bg-amber-100 text-amber-700" value={affiliate.data ? formatMoney(affiliate.data.available, affiliate.data.currency, locale) : "—"} label={tt("affiliateBalance")} />
        <Figure href={`${base}/referrals`} icon={<Gift className="size-5" aria-hidden />} tone="bg-rose-100 text-rose-700" value={referral.data ? formatMoney(referral.data.available, referral.data.currency, locale) : "—"} label={tt("referralBalance")} />
      </ul>

      {/* Ideas: the favorite categories, and the invitation of friends. */}
      <div className="grid gap-3 md:grid-cols-2">
        <section aria-labelledby="today-fav-title" className="grid content-start gap-3 rounded-2xl border bg-background p-4" data-testid="today-favorites">
          <h2 id="today-fav-title" className="flex items-center gap-2 text-base font-semibold"><Heart className="size-4 text-rose-500" aria-hidden />{tt("favoritesTitle")}</h2>
          {favorites.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">{favorites.map((c) => <li key={c} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium"><CategoryName category={c} /></li>)}</ul>
          ) : <p className="text-sm text-muted-foreground">{tt("noFavorites")}</p>}
          <p className="text-sm text-muted-foreground">{tt("favoritesHint")}</p>
          <div><Link href={`${base}/workshops`} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"><Sparkles className="size-4" aria-hidden />{tt("explore")}</Link></div>
        </section>
        <section aria-labelledby="today-invite-title" className="grid content-start gap-3 rounded-2xl border bg-background p-4" data-testid="today-invite">
          <h2 id="today-invite-title" className="flex items-center gap-2 text-base font-semibold"><Gift className="size-4 text-emerald-600" aria-hidden />{tt("inviteTitle")}</h2>
          <p className="text-sm text-muted-foreground">{tt("inviteBody")}</p>
          {invites.data ? <p className="text-sm font-medium" data-testid="today-invite-stats">{tt("inviteStats", { friends: invites.data.items.length, amount: formatMoney(invites.data.total, invites.data.currency, locale) })}</p> : null}
          <div><Link href={`${base}/referrals`} className="inline-flex h-9 items-center rounded-lg border px-4 text-sm font-medium hover:bg-muted">{tt("inviteCta")}</Link></div>
        </section>
      </div>
    </div>
  );
}

/** The name of a category in the language of the page. */
function CategoryName({ category }: { category: string }) {
  const tc = useTranslations("site.categories");
  return <>{tc(category as never)}</>;
}

function Section({ icon, title, id, action, children }: { icon: ReactNode; title: string; id: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-3" data-testid={id}>
      <div className="flex items-center justify-between gap-3">
        <h2 id={`${id}-title`} className="flex items-center gap-2 text-base font-semibold">{icon}{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Figure({ href, icon, tone, value, label }: { href: string; icon: ReactNode; tone: string; value: string; label: string }) {
  return (
    <li>
      <Link href={href} className="flex h-full items-center gap-3 rounded-2xl border bg-background p-3 shadow-sm transition hover:shadow-md">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tone)}>{icon}</span>
        <span className="grid min-w-0"><span className="truncate text-lg font-bold tabular-nums leading-tight">{value}</span><span className="text-xs text-muted-foreground">{label}</span></span>
      </Link>
    </li>
  );
}

function whenText(tb: ReturnType<typeof useTranslations>, when: When): string {
  return when.kind === "inDays" ? tb("when.inDays", { days: when.days }) : tb(`when.${when.kind}` as never);
}
