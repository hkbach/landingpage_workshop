import { lastMonthKeys, monthKey } from "./finance";

// Booking statistics for the shop owner overview: how many bookings per day (last 30 days) or per month (3, 6 or 12 months),
// split by what became of them. A booking counts on the day / month of its session, in the shop timezone.

export const TREND_PERIODS = ["1m", "3m", "6m", "12m"] as const;
export type TrendPeriod = (typeof TREND_PERIODS)[number];

export type OutcomeGroup = "attended" | "upcoming" | "lost";
/** Checked in or completed = attended; confirmed = still to come; cancelled, no-show or released = lost. */
export function outcomeGroup(status: string): OutcomeGroup {
  if (status === "CHECKED_IN" || status === "COMPLETED") return "attended";
  if (status === "CONFIRMED") return "upcoming";
  return "lost";
}

export interface BookingPoint { startsAt: string; status: string; guests: number }

export interface TrendBucket { key: string; attended: number; upcoming: number; lost: number; total: number; guests: number }

const DAY = 86_400_000;
const dayOf = (iso: string, timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));

/** The `count` local days ending today, oldest first, as "YYYY-MM-DD". */
export function lastDayKeys(now: Date, timeZone: string, count: number): string[] {
  const end = Date.parse(`${dayOf(now.toISOString(), timeZone)}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(end - (count - 1 - i) * DAY).toISOString().slice(0, 10));
}

export const isDailyPeriod = (p: TrendPeriod) => p === "1m";

/** Bucket keys of a period: 30 days for "1m", otherwise 3, 6 or 12 month keys. */
export function trendKeys(period: TrendPeriod, now: Date, timeZone: string): string[] {
  return period === "1m" ? lastDayKeys(now, timeZone, 30) : lastMonthKeys(now, timeZone, Number.parseInt(period, 10));
}

/** One bucket per key (zeros when nothing happened), so the chart always shows the whole period. */
export function bookingSeries(points: readonly BookingPoint[], period: TrendPeriod, now: Date, timeZone: string): TrendBucket[] {
  const keys = trendKeys(period, now, timeZone);
  const by = new Map<string, TrendBucket>(keys.map((key) => [key, { key, attended: 0, upcoming: 0, lost: 0, total: 0, guests: 0 }]));
  const keyOf = isDailyPeriod(period) ? (iso: string) => dayOf(iso, timeZone) : (iso: string) => monthKey(iso, timeZone);
  for (const p of points) {
    const b = by.get(keyOf(p.startsAt));
    if (!b) continue;
    b[outcomeGroup(p.status)] += 1;
    b.total += 1;
    b.guests += p.guests;
  }
  return keys.map((k) => by.get(k)!);
}

export interface TrendTotals { total: number; guests: number; attended: number; upcoming: number; lost: number; lostRate: number }
export function trendTotals(series: readonly TrendBucket[]): TrendTotals {
  const t = series.reduce(
    (a, b) => ({ total: a.total + b.total, guests: a.guests + b.guests, attended: a.attended + b.attended, upcoming: a.upcoming + b.upcoming, lost: a.lost + b.lost }),
    { total: 0, guests: 0, attended: 0, upcoming: 0, lost: 0 },
  );
  return { ...t, lostRate: t.total ? t.lost / t.total : 0 };
}
