import { getLocale, getTranslations } from "next-intl/server";
import { CalendarClock, CalendarDays, CheckCircle2, Circle, ClipboardList, Sparkles, Users, Wallet } from "lucide-react";
import { bookingSeries, ledgerFromPayments, TREND_PERIODS, type TrendBucket, type TrendPeriod } from "@workshop/shared";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitForReview } from "@/components/dashboard/shell/submit-for-review";
import { BookingTrend } from "@/components/dashboard/booking-trend";
import { LiveSummary } from "@/components/dashboard/live-summary";
import { SummaryCard } from "@/components/dashboard/summary-card";
import { ShopLink } from "@/components/dashboard/shell/shop-link";
import { dayKey } from "@/lib/format";
import { liveBookings } from "@/lib/mock/booking-store";
import { getFeeRates } from "@/lib/mock/fee-rates-store";
import { bookingHistory, currentShop, customers, mockLandingPages, sessions, sitePage, workshops } from "@/lib/mock/data";

// Computed outside the component: depends on the current time.
function computeOverview() {
  const now = Date.now();
  const tz = currentShop.timezone;
  const today = dayKey(new Date(now).toISOString(), tz);
  const bookings = liveBookings();
  const live = bookings.filter((b) => b.status !== "CANCELLED");
  const upcoming = sessions.filter((s) => s.status === "RUNNING" && new Date(s.startsAt).getTime() > now);
  const activeWorkshopIds = new Set(workshops.filter((w) => w.status === "ACTIVE").map((w) => w.id));
  // Every booking of the past year: the history plus the recent bookings of the mock shop.
  const points = [...bookingHistory, ...bookings.map((b) => ({ startsAt: b.startsAt, status: b.status, guests: b.quantity }))];
  const nowDate = new Date(now);
  const trend = Object.fromEntries(TREND_PERIODS.map((p) => [p, bookingSeries(points, p, nowDate, tz)])) as Record<TrendPeriod, TrendBucket[]>;
  const month = trend["3m"].at(-1)!;
  const seatsOpen = upcoming.reduce((n, s) => n + s.capacity, 0);
  const seatsTaken = upcoming.reduce((n, s) => n + s.reservedCount, 0);
  const bookingCount = (id: string) => bookings.filter((b) => b.customerId === id && b.status !== "CANCELLED").length;
  return {
    trend,
    month: { total: month.total, guests: month.guests, lostRate: month.total ? month.lost / month.total : 0 },
    workshops: { active: workshops.filter((w) => w.status === "ACTIVE").length, draft: workshops.filter((w) => w.status === "DRAFT").length },
    sessions: { upcoming: upcoming.length, fill: seatsOpen ? seatsTaken / seatsOpen : 0 },
    customers: { total: customers.length, repeat: customers.filter((c) => bookingCount(c.id) >= 2).length },
    todayBookings: live.filter((b) => dayKey(b.startsAt, tz) === today).length,
    upcomingSessions: upcoming.length,
    unpaid: live.filter((b) => b.paymentStatus === "UNPAID").length,
    // FR-SITE-04 prerequisites for "Submit for review".
    checklist: {
      identity: Boolean(currentShop.name.trim()),
      hero: sitePage.draft.sections.some((s) => s.type === "hero" && s.enabled),
      contact: Boolean(currentShop.contactEmail && currentShop.contactPhone && currentShop.address),
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
  const ts = await getTranslations("dashboard.overview.summary");
  const locale = await getLocale();
  const o = computeOverview();
  const bookings = liveBookings();
  const pct = (n: number) => new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(n);
  const num = (n: number) => new Intl.NumberFormat(locale).format(n);
  const kpis = [
    { key: "today", value: o.todayBookings, href: "/shopowner/today", icon: CalendarClock },
    { key: "upcoming", value: o.upcomingSessions, href: "/shopowner/sessions", icon: ClipboardList },
    { key: "unpaid", value: o.unpaid, href: "/shopowner/bookings", icon: Wallet },
  ] as const;
  const items = Object.entries(o.checklist) as [keyof typeof o.checklist, boolean][];
  const allDone = items.every(([, done]) => done);
  const doneCount = items.filter(([, d]) => d).length;

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section aria-label={t("kpiLabel")} className="grid gap-4 sm:grid-cols-3">
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
            rows={[{ label: ts("sessions.upcoming"), value: num(o.sessions.upcoming) }, { label: ts("sessions.fill"), value: pct(o.sessions.fill) }]}
          />
          <SummaryCard
            href="/shopowner/customers" icon={Users} title={ts("customers.title")} linkLabel={ts("open")}
            rows={[{ label: ts("customers.total"), value: num(o.customers.total) }, { label: ts("customers.repeat"), value: num(o.customers.repeat) }]}
          />
          <LiveSummary
            rows={ledgerFromPayments(bookings, getFeeRates())} currency={currentShop.currency} timezone={currentShop.timezone}
            mainPage={{ name: currentShop.name, template: sitePage.template, seed: mockLandingPages }} shopStatus={currentShop.status}
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
            {currentShop.status === "DRAFT" || currentShop.status === "PENDING_REVIEW" ? (
              <SubmitForReview ready={allDone} status={currentShop.status} />
            ) : null}
          </CardContent>
        </Card>
      }
    </div>
  );
}
