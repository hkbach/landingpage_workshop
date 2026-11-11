// SERVER-ONLY: the ratings guests give to the workshops they attended, until apps/api exists. A guest rates a booking they CHECKED IN to (the Completed button of My Booking), once, from 1 to 5 stars and with
// an optional comment. The rating of a workshop is the average the shop already had plus the ratings given here. Administrators only look at them. Lives on globalThis like the other mock stores.
// TODO(api): `workshop_ratings` (booking_id unique, workshop_id, organization_id, customer_id, stars 1..5, comment), the average kept up to date by the backend, a way to report an abusive comment.
import type { Workshop } from "../types";
import { liveBookings } from "./booking-store";

export const MAX_COMMENT = 500;

export interface Rating { bookingId: string; bookingCode: string; workshopId: string; customerId: string; stars: number; comment: string; createdAt: string }

const g = globalThis as unknown as { __ratings?: Rating[] };
const store = () => (g.__ratings ??= []);

/** Test helper: nobody rated anything. */
export function resetRatingStore(): void {
  g.__ratings = [];
}

export const listRatings = (): Rating[] => store().map((r) => ({ ...r }));
export const ratingOfBooking = (bookingId: string): Rating | undefined => { const r = store().find((x) => x.bookingId === bookingId); return r ? { ...r } : undefined; };

export type RateResult = { ok: true; rating: Rating } | { ok: false; code: "NOT_FOUND" | "NOT_CHECKED_IN" | "ALREADY_RATED" | "INVALID" };

/**
 * A guest rates the workshop of their own booking (found by its code among the bookings of that customer; anything else is NOT_FOUND). Only a booking the guest checked in to can be rated
 * (NOT_CHECKED_IN otherwise), once (ALREADY_RATED), with a whole number of stars from 1 to 5 (INVALID) and a comment of at most 500 characters (trimmed).
 */
export function rateBooking(customerId: string, code: string, stars: unknown, comment: unknown, now: Date = new Date()): RateResult {
  const b = liveBookings().find((x) => x.bookingCode === code && x.customerId === customerId);
  if (!b) return { ok: false, code: "NOT_FOUND" };
  if (b.status !== "CHECKED_IN") return { ok: false, code: "NOT_CHECKED_IN" };
  if (store().some((r) => r.bookingId === b.id)) return { ok: false, code: "ALREADY_RATED" };
  const text = typeof comment === "string" ? comment.trim() : "";
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5 || (comment !== undefined && typeof comment !== "string") || text.length > MAX_COMMENT) return { ok: false, code: "INVALID" };
  const rating: Rating = { bookingId: b.id, bookingCode: b.bookingCode, workshopId: b.workshopId, customerId, stars, comment: text, createdAt: now.toISOString() };
  store().push(rating);
  return { ok: true, rating: { ...rating } };
}

/** The stars the guests gave a workshop here: how many ratings and their sum. */
export function givenRatings(workshopId: string): { count: number; sum: number } {
  const mine = store().filter((r) => r.workshopId === workshopId);
  return { count: mine.length, sum: mine.reduce((n, r) => n + r.stars, 0) };
}

/** The workshop with its rating brought up to date: the average the shop already had (with the number of ratings it comes from) and the ratings given here, one decimal. */
export function withRating<T extends Pick<Workshop, "id" | "rating">>(w: T): T {
  const { count, sum } = givenRatings(w.id);
  if (count === 0) return w;
  const total = (w.rating?.count ?? 0) + count;
  const average = Math.round((((w.rating?.average ?? 0) * (w.rating?.count ?? 0) + sum) / total) * 10) / 10;
  return { ...w, rating: { average, count: total } };
}
