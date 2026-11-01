// SERVER-ONLY: the bookings as the mock backend knows them, until apps/api exists. The demo rows, plus the status changes the ops screens
// make (cancel, check-in, ...: they are sent here so they survive a reload and the promotion rules can see them), plus the system rule
// that a booking not checked in becomes SESSION_EXPIRED when its session ends. Lives on globalThis like the other mock stores.
import type { BookingStatus, BookingUse } from "@workshop/shared";
import { expiredStatus } from "@/lib/booking-state";
import type { Booking } from "@/lib/types";
import { bookings as seed, sessions } from "./data";

interface Change { status: BookingStatus; cancelReason?: string }
const g = globalThis as unknown as { __bookingChanges?: Map<string, Change> };
const changes = () => (g.__bookingChanges ??= new Map<string, Change>());

/** Test helper: back to the demo rows. */
export function resetBookingStore(): void {
  g.__bookingChanges = new Map();
}

/** Test helper: every booking is cancelled, so no promotion is in use and any promotion can be paused. */
export function releaseAllBookings(): void {
  for (const b of seed) changes().set(b.id, { status: "CANCELLED" });
}

/** Records a status change of a booking; false when the booking does not exist. */
export function setBookingStatus(id: string, status: BookingStatus, cancelReason?: string): boolean {
  if (!seed.some((b) => b.id === id)) return false;
  changes().set(id, { status, ...(cancelReason ? { cancelReason } : {}) });
  return true;
}

/** Every booking with its current status at `now`. */
export function liveBookings(now: Date = new Date()): Booking[] {
  return seed.map((b) => {
    const c = changes().get(b.id);
    const current = c ? { ...b, status: c.status, cancelReason: c.cancelReason ?? b.cancelReason } : b;
    const session = sessions.find((s) => s.id === b.sessionId);
    return session ? { ...current, status: expiredStatus(current.status, session, now) } : current;
  });
}

/** What the pause rule needs about every booking (see bookingsBlockingPause). */
export function bookingUses(now: Date = new Date()): BookingUse[] {
  return liveBookings(now).flatMap((b) => {
    const s = sessions.find((x) => x.id === b.sessionId);
    return s ? [{ id: b.id, bookingCode: b.bookingCode, status: b.status, promotionIds: b.promotionIds ?? [], sessionEndsAt: s.endsAt, sessionStatus: s.status }] : [];
  });
}
