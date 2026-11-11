// SERVER-ONLY: the ratings guests give to the workshops they attended, until apps/api exists. A guest rates a booking they CHECKED IN to once the SESSION HAS ENDED (the Rate this workshop button of My Booking), once, from 1 to 5 stars and with
// an optional comment; the guest cannot edit it. The rating of a workshop is the average the shop already had plus the ratings given here. The shop owner and the administrators read the comments; an administrator
// can remove a comment that breaks the rules (with a reason): a removed rating no longer counts in the average and is not shown to the shop. Lives on globalThis like the other mock stores.
// TODO(api): `workshop_ratings` (booking_id unique, workshop_id, organization_id, customer_id, stars 1..5, comment, removed_at, removed_reason), the average kept up to date by the backend.
import type { Workshop } from "../types";
import { liveBookings } from "./booking-store";

export const MAX_COMMENT = 500;

/** Whether the session of the booking has ended (the guest can rate it from then on). */
export const sessionEnded = (b: { endsAt: string }, now: Date = new Date()): boolean => new Date(b.endsAt).getTime() <= now.getTime();

export interface Rating { id: string; /** Set when an administrator removed the rating (it no longer counts and the shop does not see it). */ removedReason?: string; removedAt?: string; bookingId: string; bookingCode: string; workshopId: string; customerId: string; stars: number; comment: string; createdAt: string }

const g = globalThis as unknown as { __ratings?: Rating[] };
const store = () => (g.__ratings ??= []);

/** Test helper: nobody rated anything. */
export function resetRatingStore(): void {
  g.__ratings = [];
}

export const listRatings = (): Rating[] => store().map((r) => ({ ...r }));
export const ratingOfBooking = (bookingId: string): Rating | undefined => { const r = store().find((x) => x.bookingId === bookingId); return r ? { ...r } : undefined; };

export type RateResult = { ok: true; rating: Rating } | { ok: false; code: "NOT_FOUND" | "NOT_CHECKED_IN" | "NOT_ENDED" | "ALREADY_RATED" | "INVALID" };

/**
 * A guest rates the workshop of their own booking (found by its code among the bookings of that customer; anything else is NOT_FOUND). Only a booking the guest checked in to can be rated
 * (NOT_CHECKED_IN otherwise) and only after its session ended (NOT_ENDED), once (ALREADY_RATED), with a whole number of stars from 1 to 5 (INVALID) and a comment of at most 500 characters (trimmed).
 */
export function rateBooking(customerId: string, code: string, stars: unknown, comment: unknown, now: Date = new Date()): RateResult {
  const b = liveBookings().find((x) => x.bookingCode === code && x.customerId === customerId);
  if (!b) return { ok: false, code: "NOT_FOUND" };
  if (b.status !== "CHECKED_IN") return { ok: false, code: "NOT_CHECKED_IN" };
  if (!sessionEnded(b, now)) return { ok: false, code: "NOT_ENDED" };
  if (store().some((r) => r.bookingId === b.id)) return { ok: false, code: "ALREADY_RATED" };
  const text = typeof comment === "string" ? comment.trim() : "";
  if (typeof stars !== "number" || !Number.isInteger(stars) || stars < 1 || stars > 5 || (comment !== undefined && typeof comment !== "string") || text.length > MAX_COMMENT) return { ok: false, code: "INVALID" };
  const rating: Rating = { id: `rt-${store().length + 1}`, bookingId: b.id, bookingCode: b.bookingCode, workshopId: b.workshopId, customerId, stars, comment: text, createdAt: now.toISOString() };
  store().push(rating);
  return { ok: true, rating: { ...rating } };
}

/** The stars the guests gave a workshop here: how many ratings and their sum. */
export function givenRatings(workshopId: string): { count: number; sum: number } {
  const mine = store().filter((r) => r.workshopId === workshopId && !r.removedAt);
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

/** An administrator removes the rating of a booking with a reason, or puts it back. NOT_FOUND for an unknown id; ALREADY_REMOVED / NOT_REMOVED when nothing changes. */
export function setRatingRemoved(id: string, removed: boolean, reason: string | undefined, now: Date = new Date()): { ok: true; rating: Rating } | { ok: false; code: "NOT_FOUND" | "ALREADY_REMOVED" | "NOT_REMOVED" } {
  const r = store().find((x) => x.id === id);
  if (!r) return { ok: false, code: "NOT_FOUND" };
  if (removed) {
    if (r.removedAt) return { ok: false, code: "ALREADY_REMOVED" };
    r.removedAt = now.toISOString();
    r.removedReason = reason ?? "";
  } else {
    if (!r.removedAt) return { ok: false, code: "NOT_REMOVED" };
    delete r.removedAt;
    delete r.removedReason;
  }
  return { ok: true, rating: { ...r } };
}

/** What the shop owner reads: the ratings that are not removed, newest first, with the workshop and the guest. TODO(api): filtered by organization_id of the session. */
export interface OwnerRating { id: string; bookingCode: string; workshopId: string; workshopTitle: string; guestName: string; stars: number; comment: string; createdAt: string }
