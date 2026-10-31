import type { BookingStatus, PaymentStatus, SessionStatus } from "@workshop/shared";

/**
 * Booking state machine (REQUIREMENTS 6.1). Pure; mirrors the future backend `bookings/booking-state.ts`.
 * Booking status and payment status are independent (BR-06).
 */

export const LATE_RELEASE_AFTER_MINUTES = 30;

export type BookingAction = "CHECK_IN" | "LATE_RELEASE" | "NO_SHOW" | "CANCEL" | "COMPLETE" | "RESCHEDULE";

export type BlockedReason =
  | "INVALID_STATE" // not allowed from the current status
  | "SESSION_CANCELLED"
  | "TOO_EARLY_LATE_RELEASE" // now < starts + 30 min
  | "SESSION_NOT_ENDED" // now < ends
  | "SESSION_FULL"; // LATE_RELEASED -> CHECKED_IN needs room

export interface ActionState {
  allowed: boolean;
  reason?: BlockedReason;
  /** Caller must collect a reason before executing (cancel). */
  requiresReason?: boolean;
}

export interface StateBooking { status: BookingStatus; quantity: number }
export interface StateSession {
  startsAt: string; endsAt: string; status: SessionStatus; capacity: number; reservedCount: number;
}

const ok = (extra?: Partial<ActionState>): ActionState => ({ allowed: true, ...extra });
const no = (reason: BlockedReason): ActionState => ({ allowed: false, reason });

/** Status that holds seats (BR-07). */
export function holdsSeat(status: BookingStatus): boolean {
  return status === "CONFIRMED" || status === "CHECKED_IN" || status === "COMPLETED";
}

export function canTransition(booking: StateBooking, session: StateSession, now: Date): Record<BookingAction, ActionState> {
  const t = now.getTime();
  const starts = new Date(session.startsAt).getTime();
  const ends = new Date(session.endsAt).getTime();
  const cancelledSession = session.status === "CANCELLED";
  const s = booking.status;

  const checkIn: ActionState =
    s === "CONFIRMED"
      ? cancelledSession ? no("SESSION_CANCELLED") : ok()
      : s === "LATE_RELEASED"
        ? cancelledSession
          ? no("SESSION_CANCELLED")
          : session.capacity - session.reservedCount >= booking.quantity ? ok() : no("SESSION_FULL")
        : no("INVALID_STATE");

  const lateRelease: ActionState =
    s !== "CONFIRMED" ? no("INVALID_STATE")
      : t >= starts + LATE_RELEASE_AFTER_MINUTES * 60_000 ? ok() : no("TOO_EARLY_LATE_RELEASE");

  const noShow: ActionState =
    s !== "CONFIRMED" ? no("INVALID_STATE") : t >= ends ? ok() : no("SESSION_NOT_ENDED");

  const cancel: ActionState = s === "CONFIRMED" ? ok({ requiresReason: true }) : no("INVALID_STATE");
  const complete: ActionState = s === "CHECKED_IN" ? ok() : no("INVALID_STATE");
  // FR-OPS-07 (Should): only CONFIRMED bookings of a live session may move.
  const reschedule: ActionState =
    s !== "CONFIRMED" ? no("INVALID_STATE") : cancelledSession ? no("SESSION_CANCELLED") : ok();

  return { CHECK_IN: checkIn, LATE_RELEASE: lateRelease, NO_SHOW: noShow, CANCEL: cancel, COMPLETE: complete, RESCHEDULE: reschedule };
}

export function allowedActions(booking: StateBooking, session: StateSession, now: Date): BookingAction[] {
  const states = canTransition(booking, session, now);
  return (Object.keys(states) as BookingAction[]).filter((a) => states[a].allowed);
}

const TARGET: Partial<Record<BookingAction, BookingStatus>> = {
  CHECK_IN: "CHECKED_IN", LATE_RELEASE: "LATE_RELEASED", NO_SHOW: "NO_SHOW", CANCEL: "CANCELLED", COMPLETE: "COMPLETED",
};

export function targetStatus(action: BookingAction): BookingStatus | undefined {
  return TARGET[action];
}

/** Seat delta for a status change on the session (BR-07). */
export function seatDelta(from: BookingStatus, to: BookingStatus, quantity: number): number {
  return (holdsSeat(to) ? quantity : 0) - (holdsSeat(from) ? quantity : 0);
}

export interface PaymentLike { type: "PAYMENT" | "REFUND"; amount: number }

/** payment_status recomputed from entries (FR-PAY-01). */
export function computePaymentStatus(totalAmount: number, entries: readonly PaymentLike[]): PaymentStatus {
  let paid = 0;
  let refunded = 0;
  for (const e of entries) {
    if (e.type === "PAYMENT") paid += e.amount;
    else refunded += e.amount;
  }
  const net = paid - refunded;
  const hasRefund = refunded > 0;
  if (entries.length === 0) return "UNPAID";
  if (net >= totalAmount && net > 0) return "PAID";
  if (hasRefund) return net <= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED";
  if (net > 0) return "PARTIALLY_PAID";
  return "UNPAID";
}

export function netPaid(entries: readonly PaymentLike[]): number {
  return entries.reduce((n, e) => n + (e.type === "PAYMENT" ? e.amount : -e.amount), 0);
}
