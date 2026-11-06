"use client";

import { useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, CalendarClock, CheckCircle2, Clock, History, MapPin, Search, Sparkles, StickyNote, Ticket, Users, XCircle, type LucideProps } from "lucide-react";
import { formatMoney, pickLocalized, type BookingStatus, type Locale } from "@workshop/shared";
import { CancelBooking } from "@/components/booking/CancelBooking";
import { safeImage, safeMaps } from "@/components/sections/safe-url";
import { Field } from "@/components/dashboard/shell/field";
import { NativeSelect } from "@/components/dashboard/shell/native-select";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Input } from "@/components/ui/input";
import { PaginationBar } from "@/components/ui/pagination-bar";
import {
  BOOKING_TABS, cancelBlock, checkInNote, filterBookings, sortBookings, summarize, tabOf, whenOf, type BookingTab, type CustomerBooking, type When,
} from "@/lib/customer-bookings";
import { fetchCustomerBookings } from "@/lib/customer-api";
import { formatTime } from "@/lib/format";
import { usePagination } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { GoogleMapsButton } from "./google-maps-button";
import { useCustomer } from "./customer-shell";

type Icon = ComponentType<LucideProps>;
const TILES: Record<BookingTab, { icon: Icon; tone: string; ring: string }> = {
  all: { icon: Ticket, tone: "bg-slate-100 text-slate-700", ring: "ring-slate-400" },
  upcoming: { icon: CalendarClock, tone: "bg-emerald-100 text-emerald-700", ring: "ring-emerald-500" },
  past: { icon: History, tone: "bg-sky-100 text-sky-700", ring: "ring-sky-500" },
  cancelled: { icon: XCircle, tone: "bg-rose-100 text-rose-700", ring: "ring-rose-400" },
};
const STATUS_TONE: Record<BookingStatus, string> = {
  NOT_CONFIRMED: "bg-amber-100 text-amber-900", CONFIRMED: "bg-emerald-100 text-emerald-800", CHECKED_IN: "bg-indigo-100 text-indigo-800", CANCELLED: "bg-rose-100 text-rose-800",
};

/**
 * My Booking: the bookings of the guest, as tickets. The list is the shop owner's Bookings page made for a guest: the figures at the top are the tabs (All, Upcoming, Past,
 * Cancelled), then a search (booking code, workshop, shop), a workshop and a range of days, and the list with its pages. A guest cannot check themselves in (the shop does, at
 * the studio): they see when they were checked in and are told to show their code. They can cancel a booking until its session starts, with a reason that is optional.
 */
export function CustomerBookings() {
  const t = useTranslations("customer");
  const tb = useTranslations("customer.bookings");
  const locale = useLocale() as Locale;
  const { accountId, email, profile } = useCustomer();
  const queryClient = useQueryClient();
  const key = ["customer-bookings", accountId, email ?? "no-login"];
  const query = useQuery({ queryKey: key, queryFn: () => fetchCustomerBookings(accountId, email), retry: false });
  const [tab, setTab] = useState<BookingTab>("all");
  const [text, setText] = useState("");
  const [workshopId, setWorkshopId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cancelled, setCancelled] = useState<string | null>(null); // the code of the booking the guest just cancelled

  const all = useMemo(() => query.data?.bookings ?? [], [query.data]);
  const now = useMemo(() => new Date(query.data?.now ?? 0), [query.data]);
  // The bookings the search, the workshop and the range leave: the figures of the tabs count these, and a tab shows its part of them.
  const inScope = useMemo(() => filterBookings(all, { tab: "all", query: text, workshopId, from, to }, now), [all, now, text, workshopId, from, to]);
  const summary = useMemo(() => summarize(inScope, now), [inScope, now]);
  const list = useMemo(() => sortBookings(tab === "all" ? inScope : inScope.filter((b) => tabOf(b, now) === tab), now), [inScope, tab, now]);
  const pg = usePagination(list, [tab, text, workshopId, from, to].join("|"));
  const workshops = useMemo(() => {
    const seen = new Map<string, string>();
    for (const b of all) if (!seen.has(b.workshopId)) seen.set(b.workshopId, pickLocalized(b.workshopTitle, locale, b.shop.defaultLocale as Locale));
    return [...seen].map(([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title, locale));
  }, [all, locale]);
  const filtered = text.trim() !== "" || workshopId !== "" || from !== "" || to !== "";
  const clear = () => { setText(""); setWorkshopId(""); setFrom(""); setTo(""); };
  const counts: Record<BookingTab, number> = { all: summary.all, upcoming: summary.upcoming, past: summary.past, cancelled: summary.cancelled };

  if (query.isPending) return <p role="status" aria-busy="true" className="text-sm text-muted-foreground">{t("shell.loading")}</p>;
  if (query.isError) {
    return (
      <div role="alert" className="grid justify-items-start gap-3" data-testid="customer-bookings-failed">
        <p className="text-sm">{t("gate.loadFailed")}</p>
        <Button onClick={() => void query.refetch()}>{t("gate.retry")}</Button>
      </div>
    );
  }

  const nextWhen = summary.next ? whenOf(summary.next, now) : null;
  return (
    <div className="grid gap-5" data-testid="customer-bookings">
      {/* The banner: the title, and what comes next. */}
      <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100 p-5 sm:p-7">
        <Sparkles className="pointer-events-none absolute -end-3 -top-3 size-28 text-white/60" aria-hidden />
        <div className="relative grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("menu.bookings")}</h1>
            <p className="mt-1 text-sm text-foreground/70">{tb("intro")}</p>
          </div>
          <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm backdrop-blur" data-testid="customer-bookings-next">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700"><CalendarCheck className="size-3.5" aria-hidden />{tb("nextUp")}</p>
            {summary.next && nextWhen ? (
              <p className="mt-0.5 text-sm font-medium">
                {pickLocalized(summary.next.workshopTitle, locale, summary.next.shop.defaultLocale as Locale)}
                <span className="text-foreground/70"> · {whenText(tb, nextWhen)} · {formatTime(summary.next.startsAt, summary.next.timezone, locale)}</span>
              </p>
            ) : <p className="mt-0.5 text-sm text-foreground/70">{tb("nextNone")}</p>}
          </div>
        </div>
      </header>

      {/* The tabs: the figures of the bookings, a click shows only those. */}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={tb("count", { count: counts[tab] })}>
        {BOOKING_TABS.map((k) => {
          const tile = TILES[k];
          const on = tab === k;
          return (
            <li key={k}>
              <button
                type="button" aria-pressed={on} data-testid={`customer-bookings-tab-${k}`} onClick={() => setTab(k)}
                className={cn("flex w-full items-center gap-3 rounded-2xl border bg-background p-3 text-start shadow-sm outline-none transition hover:shadow-md focus-visible:ring-3 focus-visible:ring-ring/50", on && cn("ring-2", tile.ring))}
              >
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", tile.tone)}><tile.icon className="size-5" aria-hidden /></span>
                <span className="grid min-w-0">
                  <span className="text-2xl font-bold leading-none tabular-nums" data-testid={`customer-bookings-count-${k}`}>{counts[k]}</span>
                  <span className="truncate text-sm text-muted-foreground">{tb(`tabs.${k}`)}{k === "past" && summary.attended > 0 ? ` · ${summary.attended} ${tb("attended").toLowerCase()}` : ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* Search and filters: the code, the workshop or the shop; a workshop; a range of days. */}
      <form role="search" className="grid gap-3 rounded-2xl border bg-background p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4" onSubmit={(e) => e.preventDefault()}>
        <Field htmlFor="cb-search" label={tb("searchLabel")} className="sm:col-span-2 lg:col-span-1">
          <div className="relative">
            <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input id="cb-search" type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={tb("searchPlaceholder")} autoComplete="off" className="ps-8" />
          </div>
        </Field>
        <Field htmlFor="cb-workshop" label={tb("workshopLabel")}>
          <NativeSelect id="cb-workshop" value={workshopId} onChange={(e) => setWorkshopId(e.target.value)}>
            <option value="">{tb("allWorkshops")}</option>
            {workshops.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
          </NativeSelect>
        </Field>
        <Field htmlFor="cb-from" label={tb("from")}><DateInput id="cb-from" value={from} max={to || undefined} onChange={setFrom} /></Field>
        <Field htmlFor="cb-to" label={tb("to")}><DateInput id="cb-to" value={to} min={from || undefined} onChange={setTo} /></Field>
        {filtered ? <div className="sm:col-span-2 lg:col-span-4"><Button type="button" variant="outline" size="sm" onClick={clear}>{tb("clear")}</Button></div> : null}
      </form>

      {cancelled ? <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" data-testid="customer-bookings-cancelled">{tb("cancelledDone", { code: cancelled })}</p> : null}
      <p role="status" className="text-sm text-muted-foreground" data-testid="customer-bookings-total">{tb("count", { count: list.length })}</p>

      {all.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-3xl border border-dashed bg-background p-10 text-center" data-testid="customer-bookings-empty">
          <span className="grid size-14 place-items-center rounded-full bg-amber-100 text-amber-700"><Ticket className="size-7" aria-hidden /></span>
          <p className="text-lg font-semibold">{tb("empty")}</p>
          <p className="max-w-sm text-sm text-muted-foreground">{tb("emptyHint")}</p>
          <Link href={`/customer/${encodeURIComponent(accountId)}/workshops`} className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90">{tb("browse")}</Link>
        </div>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-background p-8 text-center text-sm text-muted-foreground" data-testid="customer-bookings-none">{tb("noResults")}</p>
      ) : (
        <>
          <ul className="grid gap-4" data-testid="customer-bookings-list">
            {pg.items.map((b) => (
              <BookingTicket
                key={b.id} booking={b} now={now} locale={locale} email={profile.email} isNext={summary.next?.id === b.id}
                onCancelled={() => { setCancelled(b.code); void queryClient.invalidateQueries({ queryKey: key }); }}
              />
            ))}
          </ul>
          <PaginationBar {...pg.bar} />
        </>
      )}
    </div>
  );
}

/** "Today", "Tomorrow", "In 3 days", "Happening now", "Finished", "Cancelled". */
function whenText(tb: ReturnType<typeof useTranslations>, when: When): string {
  return when.kind === "inDays" ? tb("when.inDays", { days: when.days }) : tb(`when.${when.kind}` as never);
}

/** One booking as a ticket: the picture with the day, the workshop, the details, and a stub with the code and the price. */
function BookingTicket({ booking: b, now, locale, email, isNext, onCancelled }: { booking: CustomerBooking; now: Date; locale: Locale; email: string; isNext: boolean; onCancelled: () => void }) {
  const tb = useTranslations("customer.bookings");
  const title = pickLocalized(b.workshopTitle, locale, b.shop.defaultLocale as Locale);
  const phase = tabOf(b, now);
  const when = whenOf(b, now);
  const note = checkInNote(b, now);
  const block = cancelBlock(b, now);
  const cover = safeImage(b.coverUrl);
  const maps = safeMaps(b.directionsUrl);
  const dayFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: b.timezone }).format(new Date(b.startsAt));
  const dim = b.status === "CANCELLED";
  return (
    <li
      aria-labelledby={`cb-title-${b.id}`} data-testid="customer-booking-card" data-code={b.code} data-tab={phase} data-status={b.status}
      className={cn("grid overflow-hidden rounded-3xl border bg-background shadow-sm transition hover:shadow-md sm:grid-cols-[11rem_minmax(0,1fr)_14rem]", isNext && "ring-2 ring-emerald-400")}
    >
      {/* The picture, with the day of the workshop and how far it is. */}
      <div className="relative min-h-36 bg-gradient-to-br from-amber-200 to-rose-200 sm:min-h-full">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" referrerPolicy="no-referrer" className={cn("absolute inset-0 size-full object-cover", dim && "grayscale opacity-60")} />
        ) : null}
        <div className="absolute start-3 top-3 grid min-w-12 place-items-center rounded-2xl bg-white/95 px-2 py-1.5 text-center shadow" aria-hidden="true">
          <span className="text-[0.65rem] font-semibold uppercase leading-none tracking-wide text-rose-600">{dayFmt({ month: "short" })}</span>
          <span className="text-xl font-bold leading-tight text-foreground">{dayFmt({ day: "numeric" })}</span>
        </div>
        <span className="absolute bottom-3 start-3 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white" data-testid="customer-booking-when">{whenText(tb, when)}</span>
        {isNext ? <span className="absolute end-3 top-3 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow" data-testid="customer-booking-next">{tb("nextUp")}</span> : null}
      </div>

      <div className="grid content-start gap-2.5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_TONE[b.status])} data-testid="customer-booking-status">{tb(`status.${b.status}`)}</span>
          {b.status !== "CANCELLED" ? (
            <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", b.paymentStatus === "PAID" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700")}>{tb(`payment.${b.paymentStatus}`)}</span>
          ) : null}
        </div>
        <h2 id={`cb-title-${b.id}`} className={cn("text-lg font-semibold leading-snug", dim && "text-muted-foreground")}>{title}</h2>
        <p className="text-sm text-muted-foreground">{tb("shopLine", { shop: b.shop.name })}</p>
        {b.address ? (
          <p className="flex items-start gap-1.5 text-sm" data-testid="customer-booking-address">
            <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden /><span><span className="sr-only">{tb("where")}: </span>{b.address}</span>
          </p>
        ) : null}
        {b.addressNote ? <p className="whitespace-pre-line text-xs text-muted-foreground" data-testid="customer-booking-address-note"><span className="sr-only">{tb("whereNote")}: </span>{b.addressNote}</p> : null}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5"><Clock className="size-4 text-muted-foreground" aria-hidden />{dayFmt({ weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {formatTime(b.startsAt, b.timezone, locale)} – {formatTime(b.endsAt, b.timezone, locale)}</span>
          <span className="inline-flex items-center gap-1.5"><Users className="size-4 text-muted-foreground" aria-hidden />{tb("guests", { count: b.quantity })}</span>
        </p>
        {b.specialRequest ? <p className="flex items-start gap-1.5 text-sm text-muted-foreground"><StickyNote className="mt-0.5 size-4 shrink-0" aria-hidden />{tb("note", { note: b.specialRequest })}</p> : null}

        {/* What the guest is told about the check-in (the shop does it), or about the cancellation. */}
        {note?.kind === "checkedIn" ? <p className="flex items-center gap-1.5 text-sm font-medium text-indigo-700" data-testid="customer-booking-checkin"><CheckCircle2 className="size-4" aria-hidden />{tb("checkedInAt", { time: formatTime(note.at, b.timezone, locale) })}</p> : null}
        {note?.kind === "showCode" ? <p className="text-sm text-emerald-800" data-testid="customer-booking-checkin">{tb("showCode")}</p> : null}
        {note?.kind === "confirm" ? <p className="text-sm text-amber-800" data-testid="customer-booking-checkin">{tb("confirmHint")}</p> : null}
        {b.status === "CANCELLED" ? (
          <p className="text-sm text-rose-800" data-testid="customer-booking-cancelinfo">
            {b.cancelledBy ? tb(`cancelledBy.${b.cancelledBy}`) : tb("status.CANCELLED")}{b.cancelReason ? ` · ${tb("cancelReason", { reason: b.cancelReason })}` : ""}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap items-center gap-2">
          {b.canCancel ? <CancelBooking slug={b.shop.slug} code={b.code} email={email} onCancelled={onCancelled} /> : null}
          {block ? <p className="text-xs text-muted-foreground" data-testid="customer-booking-blocked">{tb(`cancelBlocked.${block}`)}</p> : null}
          {maps && phase === "upcoming" ? (
            <GoogleMapsButton href={maps} testId="customer-booking-map" />
          ) : null}
        </div>
      </div>

      {/* The stub of the ticket: the code to show at the studio, and what it costs. */}
      <div className="grid content-center gap-2 border-t border-dashed bg-muted/40 p-4 sm:border-s sm:border-t-0 sm:p-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tb("code")}</p>
          <p className={cn("break-all font-mono text-base font-bold tracking-wider", dim && "line-through decoration-rose-400")} data-testid="customer-booking-code">{b.code}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{tb("total")}</p>
          <p className="text-xl font-bold tabular-nums">{formatMoney(b.totalAmount, b.currency, locale)}</p>
          {b.discountAmount > 0 ? <p className="text-xs text-emerald-700">{tb("saved", { amount: formatMoney(b.discountAmount, b.currency, locale), codes: b.vouchers.join(", ") })}</p> : null}
        </div>
      </div>
    </li>
  );
}
