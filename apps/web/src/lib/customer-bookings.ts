import type { BookingStatus, Localized } from "@workshop/shared";
import { addDays } from "@/components/ops/time";
import { dayKey } from "./format";
import { matchesSearch } from "./text-search";

// My Booking of the guest area: what a guest sees of their own bookings and what they can do with them. A guest can check themselves in from the booking (a confirmed booking,
// from CHECKIN_OPENS_MINUTES before the session starts until it ends, while the session is not closed) and can cancel their booking until its session starts. The shop can
// still check a guest in. Pure functions, so they can be tested; `now` is given.

/** One booking as the guest area shows it (what GET /api/v1/customer/{id}/bookings gives). */
export interface CustomerBooking {
  id: string; code: string; status: BookingStatus; paymentStatus: "UNPAID" | "PAID";
  workshopId: string; workshopTitle: Localized; coverUrl?: string;
  /** Where the workshop is held (its own address, or the shop's), the note about it and a link to the way there. */ address: string; addressNote?: string; directionsUrl?: string;
  startsAt: string; endsAt: string; timezone: string; quantity: number;
  currency: string; totalAmount: number; /** What the vouchers took off (0 when none). */ discountAmount: number; /** The codes of the vouchers used. */ vouchers: string[];
  checkedInAt?: string; cancelReason?: string; cancelledBy?: "SHOP" | "GUEST"; specialRequest?: string; createdAt: string;
  /** Whether the guest can cancel it now (decided by the server: not confirmed or confirmed, session not closed, not started). */ canCancel: boolean;
  /** Whether the guest can check in now (decided by the server: confirmed, session not closed, from CHECKIN_OPENS_MINUTES before it starts until it ends). */ canCheckIn: boolean;
  /** Whether the guest can rate the workshop now (decided by the server: they checked in to this booking and did not rate it yet), and the rating they gave. */ canRate: boolean; rating?: { stars: number; comment: string };
  shop: { slug: string; name: string; address: string; defaultLocale: string };
}

/** A guest can check in from this many minutes before the session starts. */
export const CHECKIN_OPENS_MINUTES = 60;

/** When the check-in of a booking opens (ISO). */
export const checkInOpensAt = (b: Pick<CustomerBooking, "startsAt">): string => new Date(Date.parse(b.startsAt) - CHECKIN_OPENS_MINUTES * 60_000).toISOString();

export type BookingTab = "all" | "upcoming" | "past" | "cancelled";
export const BOOKING_TABS: readonly BookingTab[] = ["all", "upcoming", "past", "cancelled"];

/** Where a booking is in time: cancelled, still to come, taking place now, or over. */
export type BookingPhase = "CANCELLED" | "UPCOMING" | "IN_PROGRESS" | "PAST";

export function bookingPhase(b: Pick<CustomerBooking, "status" | "startsAt" | "endsAt">, now: Date): BookingPhase {
  if (b.status === "CANCELLED") return "CANCELLED";
  if (Date.parse(b.startsAt) > now.getTime()) return "UPCOMING";
  return Date.parse(b.endsAt) > now.getTime() ? "IN_PROGRESS" : "PAST";
}

/** The tab a booking belongs to: one taking place now is still "upcoming" (it is not over). */
export function tabOf(b: Pick<CustomerBooking, "status" | "startsAt" | "endsAt">, now: Date): Exclude<BookingTab, "all"> {
  const phase = bookingPhase(b, now);
  return phase === "CANCELLED" ? "cancelled" : phase === "PAST" ? "past" : "upcoming";
}

/** How far a booking is, in words the page picks a text for: today, tomorrow, in N days (counted by the days of the booking's zone), now, or finished. */
export type When = { kind: "today" } | { kind: "tomorrow" } | { kind: "inDays"; days: number } | { kind: "inProgress" } | { kind: "finished" } | { kind: "cancelled" };

export function whenOf(b: Pick<CustomerBooking, "status" | "startsAt" | "endsAt" | "timezone">, now: Date): When {
  const phase = bookingPhase(b, now);
  if (phase === "CANCELLED") return { kind: "cancelled" };
  if (phase === "PAST") return { kind: "finished" };
  if (phase === "IN_PROGRESS") return { kind: "inProgress" };
  const today = dayKey(now.toISOString(), b.timezone);
  const start = dayKey(b.startsAt, b.timezone);
  if (start === today) return { kind: "today" };
  if (start === addDays(today, 1)) return { kind: "tomorrow" };
  const days = Math.round((Date.parse(`${start}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  return { kind: "inDays", days };
}

/** What the guest is told about the check-in: it happened (the time), what to do to be checked in, or to confirm the booking first. Nothing for the rest. */
export type CheckInNote = { kind: "checkedIn"; at: string } | { kind: "showCode" } | { kind: "confirm" } | null;

export function checkInNote(b: Pick<CustomerBooking, "status" | "startsAt" | "endsAt" | "checkedInAt">, now: Date): CheckInNote {
  if (b.status === "CHECKED_IN") return { kind: "checkedIn", at: b.checkedInAt ?? b.startsAt };
  const phase = bookingPhase(b, now);
  if (phase === "PAST" || phase === "CANCELLED") return null;
  return b.status === "NOT_CONFIRMED" ? { kind: "confirm" } : { kind: "showCode" }; // the shop checks the guest in at the studio, with the code
}

/**
 * Why a guest cannot check in to a booking: it already is checked in, was cancelled, is not confirmed yet (the email link comes first), is over, the check-in does not open yet, or
 * the session is closed. `null` when the guest can (and when there is nothing to check in to: a booking that is over keeps `over`, the page shows the button off).
 */
export type CheckInBlock = "checkedIn" | "cancelled" | "confirm" | "over" | "notYet" | "closed" | null;

export function checkInBlock(b: Pick<CustomerBooking, "status" | "startsAt" | "endsAt" | "canCheckIn">, now: Date): CheckInBlock {
  if (b.canCheckIn) return null;
  if (b.status === "CHECKED_IN") return "checkedIn";
  if (b.status === "CANCELLED") return "cancelled";
  if (b.status === "NOT_CONFIRMED") return "confirm";
  if (bookingPhase(b, now) === "PAST") return "over";
  return now.getTime() < Date.parse(b.startsAt) - CHECKIN_OPENS_MINUTES * 60_000 ? "notYet" : "closed";
}

/** Why a booking cannot be cancelled by the guest: `null` when it can, or when there is nothing to cancel (already cancelled, or over). */
export type CancelBlock = "checkedIn" | "started" | "closed" | null;

export function cancelBlock(b: Pick<CustomerBooking, "status" | "startsAt" | "endsAt" | "canCancel">, now: Date): CancelBlock {
  if (b.canCancel || b.status === "CANCELLED") return null;
  if (b.status === "CHECKED_IN") return "checkedIn";
  const phase = bookingPhase(b, now);
  if (phase === "PAST") return null; // it took place: nothing to cancel
  return phase === "IN_PROGRESS" ? "started" : "closed"; // still to come but not cancellable: its session is closed
}

export interface BookingFilter { tab: BookingTab; query: string; workshopId: string; /** "YYYY-MM-DD" in the zone of each booking, or "". */ from: string; to: string }

/**
 * The bookings the filters leave. The search looks in the booking code, the name of the workshop (in every language the shop wrote it in) and the name of the shop;
 * case and accents do not matter. The range is on the day of the workshop (the zone of the booking).
 */
export function filterBookings(list: readonly CustomerBooking[], f: BookingFilter, now: Date): CustomerBooking[] {
  return list.filter((b) => {
    if (f.tab !== "all" && tabOf(b, now) !== f.tab) return false;
    if (f.workshopId && b.workshopId !== f.workshopId) return false;
    const day = dayKey(b.startsAt, b.timezone);
    if ((f.from && day < f.from) || (f.to && day > f.to)) return false;
    return [b.code, b.shop.name, ...Object.values(b.workshopTitle)].some((text) => typeof text === "string" && matchesSearch(text, f.query));
  });
}

/**
 * The order of the list: what is still to come first, soonest first (the next one is on top); then what is over or cancelled, the most recent first. Inside a tab
 * that has only one kind it is the same rule.
 */
export function sortBookings(list: readonly CustomerBooking[], now: Date): CustomerBooking[] {
  const rank = (b: CustomerBooking) => (tabOf(b, now) === "upcoming" ? 0 : 1);
  return [...list].sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const byStart = Date.parse(a.startsAt) - Date.parse(b.startsAt);
    return (rank(a) === 0 ? byStart : -byStart) || a.code.localeCompare(b.code);
  });
}

export interface BookingSummary { all: number; upcoming: number; past: number; cancelled: number; /** Bookings the guest was checked in to. */ attended: number; /** The first one still to come. */ next?: CustomerBooking }

export function summarize(list: readonly CustomerBooking[], now: Date): BookingSummary {
  const upcoming = sortBookings(list.filter((b) => tabOf(b, now) === "upcoming"), now);
  return {
    all: list.length, upcoming: upcoming.length, past: list.filter((b) => tabOf(b, now) === "past").length, cancelled: list.filter((b) => b.status === "CANCELLED").length,
    attended: list.filter((b) => b.status === "CHECKED_IN").length, ...(upcoming[0] ? { next: upcoming[0] } : {}),
  };
}
