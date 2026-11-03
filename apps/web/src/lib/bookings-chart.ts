// The chart of the Bookings screen: the bookings over a chosen range of days (From - To), by the day of their session in the shop time zone. A short range
// is drawn by day, a longer one by week (Monday to Sunday) and the longest by month, so the chart always has a readable number of bars.
import { outcomeGroup } from "@workshop/shared";
import { addDays } from "@/components/ops/time";
import { dayKey } from "@/lib/format";
import type { Booking } from "@/lib/types";

export type Granularity = "day" | "week" | "month";

/** What happened on one day: the bookings, their guests, and the bookings split by outcome and by payment status. */
export interface DayStat { day: string; total: number; guests: number; attended: number; upcoming: number; lost: number; paid: number; unpaid: number }
export type Bucket = Omit<DayStat, "day"> & { key: string };

export const emptyStat = (day: string): DayStat => ({ day, total: 0, guests: 0, attended: 0, upcoming: 0, lost: 0, paid: 0, unpaid: 0 });

const DAY = 86_400_000;
/** How many days a range holds, both ends counted. */
export const spanDays = (from: string, to: string): number => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

/** By day up to 31 days, by week up to 20 weeks, by month beyond. */
export const granularityFor = (from: string, to: string): Granularity => { const n = spanDays(from, to); return n <= 31 ? "day" : n <= 140 ? "week" : "month"; };

const weekStart = (key: string): string => addDays(key, -((new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7));
/** The key of the bucket a day belongs to: the day, the Monday of its week, or its month ("YYYY-MM"). */
export const bucketOf = (key: string, g: Granularity): string => (g === "day" ? key : g === "week" ? weekStart(key) : key.slice(0, 7));

/** The keys of every bucket of the range, oldest first, so a quiet period still shows as an empty bar. At most 36 months. */
export function bucketKeys(from: string, to: string, g: Granularity): string[] {
  const keys: string[] = [];
  if (g === "month") {
    let y = Number(from.slice(0, 4));
    let m = Number(from.slice(5, 7));
    const last = to.slice(0, 7);
    for (;;) {
      const k = `${y}-${String(m).padStart(2, "0")}`;
      keys.push(k);
      if (k >= last) break;
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return keys.slice(-36);
  }
  const last = bucketOf(to, g);
  for (let k = bucketOf(from, g); k <= last; k = addDays(k, g === "day" ? 1 : 7)) keys.push(k);
  return keys;
}

/** The bookings of a list counted by day (the day of the session, in the shop time zone). */
export function dayStatsOf(bookings: readonly Booking[], timeZone: string): DayStat[] {
  const by = new Map<string, DayStat>();
  for (const b of bookings) {
    const day = dayKey(b.startsAt, timeZone);
    const s = by.get(day) ?? emptyStat(day);
    s[outcomeGroup(b.status)] += 1;
    s[b.paymentStatus === "PAID" ? "paid" : "unpaid"] += 1;
    s.total += 1;
    s.guests += b.quantity;
    by.set(day, s);
  }
  return [...by.values()];
}

/** One bucket per key of the range (zeros when nothing happened), with only the days inside the range counted. */
export function seriesFor(days: readonly DayStat[], from: string, to: string): { granularity: Granularity; buckets: Bucket[] } {
  const granularity = granularityFor(from, to);
  const by = new Map<string, Bucket>(bucketKeys(from, to, granularity).map((key) => [key, { key, total: 0, guests: 0, attended: 0, upcoming: 0, lost: 0, paid: 0, unpaid: 0 }]));
  for (const d of days) {
    if (d.day < from || d.day > to) continue;
    const b = by.get(bucketOf(d.day, granularity));
    if (!b) continue;
    for (const k of ["total", "guests", "attended", "upcoming", "lost", "paid", "unpaid"] as const) b[k] += d[k];
  }
  return { granularity, buckets: [...by.values()] };
}

/** The totals of the buckets, with the share of the bookings that were checked in, cancelled or paid. */
export function totalsOf(buckets: readonly Bucket[]) {
  const t = buckets.reduce((a, b) => ({ total: a.total + b.total, guests: a.guests + b.guests, attended: a.attended + b.attended, upcoming: a.upcoming + b.upcoming, lost: a.lost + b.lost, paid: a.paid + b.paid, unpaid: a.unpaid + b.unpaid }), { total: 0, guests: 0, attended: 0, upcoming: 0, lost: 0, paid: 0, unpaid: 0 });
  return { ...t, paidRate: t.total ? t.paid / t.total : 0, lostRate: t.total ? t.lost / t.total : 0 };
}
