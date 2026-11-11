import { addDays } from "@/components/ops/time";
import { bookingPhase, type CustomerBooking } from "./customer-bookings";
import { dayKey } from "./format";

// The Today page of the guest area: what matters to a guest today. Pure functions over the bookings the guest has (so they can be tested); `now` is given.

export type DayPart = "morning" | "afternoon" | "evening";

/** The greeting of the hour: morning until 11:59, afternoon until 17:59, evening after. */
export function dayPart(hour: number): DayPart {
  return hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
}

const byStart = (a: CustomerBooking, b: CustomerBooking) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.code.localeCompare(b.code);

/** The workshops of today (the day of each booking's own time zone), the ones taking place now and the ones that are over included, a cancelled booking left out. Earliest first. */
export function todaysBookings(list: readonly CustomerBooking[], now: Date): CustomerBooking[] {
  return list.filter((b) => b.status !== "CANCELLED" && dayKey(b.startsAt, b.timezone) === dayKey(now.toISOString(), b.timezone)).sort(byStart);
}

/** What is coming in the next `days` days, after today (a cancelled booking and one that is over left out). Soonest first. */
export function weekAhead(list: readonly CustomerBooking[], now: Date, days = 7): CustomerBooking[] {
  return list.filter((b) => {
    if (bookingPhase(b, now) !== "UPCOMING") return false;
    const today = dayKey(now.toISOString(), b.timezone);
    const day = dayKey(b.startsAt, b.timezone);
    return day > today && day <= addDays(today, days);
  }).sort(byStart);
}

/** A booking that waits for the guest: not confirmed yet (the link of the email), or confirmed with something to pay and not paid. */
export type AttentionKind = "confirm" | "unpaid";
export interface Attention { booking: CustomerBooking; kind: AttentionKind }

/** The bookings still to come or taking place that need the guest: to confirm first (it comes before paying), then to pay. Soonest first. */
export function needsAttention(list: readonly CustomerBooking[], now: Date): Attention[] {
  return list
    .filter((b) => b.status !== "CANCELLED" && b.status !== "CHECKED_IN" && bookingPhase(b, now) !== "PAST")
    .flatMap((b): Attention[] => (b.status === "NOT_CONFIRMED" ? [{ booking: b, kind: "confirm" }] : b.paymentStatus === "UNPAID" && b.totalAmount > 0 ? [{ booking: b, kind: "unpaid" }] : []))
    .sort((a, b) => byStart(a.booking, b.booking));
}
