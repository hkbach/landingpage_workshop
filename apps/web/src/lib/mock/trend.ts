// SERVER-ONLY: the bookings over time, as the Overview and the Bookings screen chart them: the history of the past year plus the bookings of the mock shop.
// TODO(api): one aggregate query by day / month (organization_id from the server context).
import { bookingSeries, TREND_PERIODS, type TrendBucket, type TrendPeriod } from "@workshop/shared";
import type { Booking } from "@/lib/types";
import { bookingHistory } from "./data";

export function bookingTrend(bookings: readonly Booking[], timeZone: string, now: Date = new Date()): Record<TrendPeriod, TrendBucket[]> {
  const points = [...bookingHistory, ...bookings.map((b) => ({ startsAt: b.startsAt, status: b.status, guests: b.quantity }))];
  return Object.fromEntries(TREND_PERIODS.map((p) => [p, bookingSeries(points, p, now, timeZone)])) as Record<TrendPeriod, TrendBucket[]>;
}
