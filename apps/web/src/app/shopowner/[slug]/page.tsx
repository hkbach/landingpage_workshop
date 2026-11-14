import { getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, CalendarDays, CheckCircle2, Circle, ClipboardList, HandCoins, MailQuestion, Sparkles, Users, Wallet } from "lucide-react";
import { closeIfEnded, isSessionFinished, type TrendBucket, type TrendPeriod } from "@workshop/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookingTrend } from "@/components/dashboard/booking-trend";
import { LiveSummary } from "@/components/dashboard/live-summary";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { buttonVariants } from "@/components/ui/button";
import { ShopLink } from "@/components/dashboard/shell/shop-link";
import { dayKey } from "@/lib/format";
import { bookingSeries, TREND_PERIODS } from "@workshop/shared";
import { loadOpsData } from "@/lib/own-ops";
import { ownPageList } from "@/lib/own-site";
import { loadIncome } from "@/lib/own-finance";
import type { Booking, Customer, Session, Workshop } from "@/lib/types";

// Computed outside the component: depends on the current time.
/** What the overview counts: from the API, or from the sample data. */
interface OverviewData {
  shop: { name: string; timezone: string; contactEmail: string; contactPhone: string; address: string };
  bookings: Booking[]; sessions: Session[]; workshops: Workshop[]; customers: Customer[];
  /** A page of the shop has an enabled hero (the first item of the checklist of a first publish). */
  hasHero: boolean;
  trend: (bookings: readonly Booking[], timeZone: string, now: Date) => Record<TrendPeriod, TrendBucket[]>;
}

// Computed outside the component: depends on the current time.
function computeOverview(d: OverviewData) {
  const now = Date.now();
  const tz = d.shop.timezone;
  const today = dayKey(new Date(now).toISOString(), tz);
  const bookings = d.bookings;
  // An administrator's close and the live seats count; a workshop the owner switched keeps its new status.
  const sessions = d.sessions;
  const workshops = d.workshops;
  const live = bookings.filter((b) => b.status !== "CANCELLED");
  const upcoming = sessions.filter((s) => s.status === "RUNNING" && new Date(s.startsAt).getTime() > now);
  const activeWorkshopIds = new Set(workshops.filter((w) => w.status === "ACTIVE").map((w) => w.id));
  // Every booking of the past year: the history plus the recent bookings of the mock shop.
  const trend: Record<TrendPeriod, TrendBucket[]> = d.trend(bookings, tz, new Date(now));
  // The sessions that are closed (by the owner, or by the system when their time ended) wait for the owner to complete them.
  const shown = sessions.map((s) => closeIfEnded(s, new Date(now)));
  const shownById = new Map(shown.map((s) => [s.id, s]));
  const month = trend["3m"].at(-1)!;
  const seatsOpen = upcoming.reduce((n, s) => n + s.capacity, 0);
  const seatsTaken = upcoming.reduce((n, s) => n + s.reservedCount, 0);
  const bookingCount = (id: string) => bookings.filter((b) => b.customerId === id && b.status !== "CANCELLED").length;
  return {
    trend,
    month: { total: month.total, guests: month.guests, lostRate: month.total ? month.lost / month.total : 0 },
    workshops: { active: workshops.filter((w) => w.status === "ACTIVE").length, draft: workshops.filter((w) => w.status === "DRAFT").length },
    sessions: { upcoming: upcoming.length, fill: seatsOpen ? seatsTaken / seatsOpen : 0, toComplete: shown.filter((s) => s.status === "CLOSED").length, completed: shown.filter((s) => s.status === "COMPLETED").length },
    customers: { total: d.customers.length, repeat: d.customers.filter((c) => bookingCount(c.id) >= 2).length },
    todayBookings: live.filter((b) => dayKey(b.startsAt, tz) === today).length,
    upcomingSessions: upcoming.length,
    notConfirmed: bookings.filter((b) => b.status === "NOT_CONFIRMED").length,
    // The bookings that still owe a payment: of a session that is over and not Completed yet (the owner has to confirm them), and of a session still to come (paid at the studio).
    awaitingPayment: live.filter((b) => b.paymentStatus === "UNPAID" && b.totalAmount > 0 && shownById.get(b.sessionId)?.status === "CLOSED").length,
    payAtStudio: live.filter((b) => b.paymentStatus === "UNPAID" && b.totalAmount > 0 && shownById.has(b.sessionId) && !isSessionFinished(shownById.get(b.sessionId)!.status)).length,
    // FR-SITE-04 prerequisites for "Submit for review".
    checklist: {
      identity: Boolean(d.shop.name.trim()),
      hero: d.hasHero,
      contact: Boolean(d.shop.contactEmail && d.shop.contactPhone && d.shop.address),
      workshop: upcoming.some((s) => activeWorkshopIds.has(s.workshopId)),
    },
  };
}

const CHECKLIST_LINKS = {
  identity: "/shopowner/settings",
  hero: "/shopowner/site",
  contact: "/shopowner/settings",
  workshop: "/shopowner/sessions",
} as const;

export default async function OverviewPage() {
  const t = await getTranslations("dashboard.overview");
  // Everything below is counted from the shop's own data on the server.
  const live = await loadOpsData();
  const pages = await ownPageList(live.shop);
  const income = await loadIncome(live.shop.timezone);
  const shopRef = live.shop;
  const shopStatus = live.shop.status;
  const ts = await getTranslations("dashboard.overview.summary");
  const locale = await getLocale();
  const o = computeOverview({
    shop: live.shop, bookings: live.bookings, sessions: live.sessions, workshops: live.workshops, customers: live.customers,
    hasHero: Object.values(pages.drafts).some((d) => d.content.sections.some((x) => x.type === "hero" && x.enabled)),
    // (the bookings of the shop: nothing is added to them)
    trend: (list, tz, now) => Object.fromEntries(TREND_PERIODS.map((p) => [p, bookingSeries(list.map((b) => ({ startsAt: b.startsAt, status: b.status, guests: b.quantity })), p, now, tz)])) as Record<TrendPeriod, TrendBucket[]>,
  });
  const pct = (n: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(n);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const kpis = [
    { key: "today", value: o.todayBookings, href: "/shopowner/today", icon: CalendarClock },
    { key: "upcoming", value: o.upcomingSessions, href: "/shopowner/sessions", icon: ClipboardList },
    { key: "notConfirmed", value: o.notConfirmed, href: "/shopowner/bookings", icon: MailQuestion },
    { key: "awaitingPayment", value: o.awaitingPayment, href: "/shopowner/sessions", icon: Wallet },
    { key: "payAtStudio", value: o.payAtStudio, href: "/shopowner/bookings", icon: HandCoins },
  ] as const;
  const items = Object.entries(o.checklist) as [keyof typeof o.checklist, boolean][];
  const allDone = items.every(([, done]) => done);
  const doneCount = items.filter(([, d]) => d).length;

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section aria-label={t("kpiLabel")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {kpis.map(({ key, value, href, icon: Icon }) => (
          <ShopLink key={key} href={href} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardDescription className="flex items-center gap-2"><Icon className="size-4" aria-hidden />{t(`kpi.${key}`)}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
              </CardHeader>
            </Card>
          </ShopLink>
        ))}
      </section>

      <section aria-labelledby="summary-heading" className="grid gap-3">
        <h2 id="summary-heading" className="text-lg font-semibold">{ts("title")}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SummaryCard
            href="/shopowner/bookings" icon={ClipboardList} title={ts("bookings.title")} linkLabel={ts("open")}
            rows={[
              { label: ts("bookings.month"), value: num(o.month.total) },
              { label: ts("bookings.guests"), value: num(o.month.guests) },
              { label: ts("bookings.lostRate"), value: pct(o.month.lostRate) },
            ]}
          />
          <SummaryCard
            href="/shopowner/workshops" icon={Sparkles} title={ts("workshops.title")} linkLabel={ts("open")}
            rows={[{ label: ts("workshops.active"), value: num(o.workshops.active) }, { label: ts("workshops.draft"), value: num(o.workshops.draft) }]}
          />
          <SummaryCard
            href="/shopowner/sessions" icon={CalendarDays} title={ts("sessions.title")} linkLabel={ts("open")}
            rows={[
              { label: ts("sessions.upcoming"), value: num(o.sessions.upcoming) }, { label: ts("sessions.fill"), value: pct(o.sessions.fill) },
              { label: ts("sessions.toComplete"), value: num(o.sessions.toComplete) }, { label: ts("sessions.completed"), value: num(o.sessions.completed) },
            ]}
          />
          <SummaryCard
            href="/shopowner/customers" icon={Users} title={ts("customers.title")} linkLabel={ts("open")}
            rows={[{ label: ts("customers.total"), value: num(o.customers.total) }, { label: ts("customers.repeat"), value: num(o.customers.repeat) }]}
          />
          <LiveSummary
            rows={income?.rows ?? []} currency={shopRef.currency} timezone={shopRef.timezone}
            mainPage={{ name: shopRef.name, template: "classic" }} shopStatus={shopStatus} server={{ pages: pages.pages, liveId: pages.liveId }}
          />
        </ul>
      </section>

      <BookingTrend series={o.trend} />

      {
        <Card>
          <CardHeader>
            <CardTitle>{t("checklist.title")}</CardTitle>
            <CardDescription>{t("checklist.progress", { done: doneCount, total: items.length })}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ul className="grid gap-2">
              {items.map(([key, done]) => (
                <li key={key} className="flex items-center gap-2 text-sm">
                  {done ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <Circle className="size-4 text-muted-foreground" aria-hidden />}
                  <span className="sr-only">{done ? t("checklist.done") : t("checklist.todo")}:</span>
                  <span className={done ? "text-muted-foreground line-through" : ""}>{t(`checklist.items.${key}`)}</span>
                  {done ? null : <ShopLink href={CHECKLIST_LINKS[key]} className="ml-auto text-xs underline underline-offset-4">{t("checklist.fix")}</ShopLink>}
                </li>
              ))}
            </ul>
            {shopStatus === "DRAFT" ? (
              <div className="grid gap-2">
                <div>
                  <ShopLink href="/shopowner/site" className={buttonVariants({ variant: allDone ? "default" : "outline" })} data-testid="checklist-publish">{t("checklist.publish")}</ShopLink>
                </div>
                <p role="status" className="text-xs text-muted-foreground">{allDone ? t("checklist.readyNote") : t("checklist.notReadyNote")}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      }
    </div>
  );
}
