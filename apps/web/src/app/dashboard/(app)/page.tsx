import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarClock, CheckCircle2, Circle, ClipboardList, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitForReview } from "@/components/dashboard/shell/submit-for-review";
import { dayKey } from "@/lib/format";
import { bookings, currentShop, sessions, sitePage, workshops } from "@/lib/mock/data";

// Computed outside the component: depends on the current time.
function computeOverview() {
  const now = Date.now();
  const tz = currentShop.timezone;
  const today = dayKey(new Date(now).toISOString(), tz);
  const live = bookings.filter((b) => b.status !== "CANCELLED");
  const upcoming = sessions.filter((s) => s.status === "OPEN" && new Date(s.startsAt).getTime() > now);
  const activeWorkshopIds = new Set(workshops.filter((w) => w.status === "ACTIVE").map((w) => w.id));
  return {
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
  identity: "/dashboard/settings",
  hero: "/dashboard/site",
  contact: "/dashboard/settings",
  workshop: "/dashboard/sessions",
} as const;

export default async function OverviewPage() {
  const t = await getTranslations("dashboard.overview");
  const o = computeOverview();
  const kpis = [
    { key: "today", value: o.todayBookings, href: "/dashboard/today", icon: CalendarClock },
    { key: "upcoming", value: o.upcomingSessions, href: "/dashboard/sessions", icon: ClipboardList },
    { key: "unpaid", value: o.unpaid, href: "/dashboard/bookings", icon: Wallet },
  ] as const;
  const items = Object.entries(o.checklist) as [keyof typeof o.checklist, boolean][];
  const allDone = items.every(([, done]) => done);
  const doneCount = items.filter(([, d]) => d).length;

  return (
    <div className="mx-auto grid max-w-5xl gap-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <section aria-label={t("kpiLabel")} className="grid gap-4 sm:grid-cols-3">
        {kpis.map(({ key, value, href, icon: Icon }) => (
          <Link key={key} href={href} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardDescription className="flex items-center gap-2"><Icon className="size-4" aria-hidden />{t(`kpi.${key}`)}</CardDescription>
                <CardTitle className="text-3xl">{value}</CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

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
                  {done ? null : <Link href={CHECKLIST_LINKS[key]} className="ml-auto text-xs underline underline-offset-4">{t("checklist.fix")}</Link>}
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
