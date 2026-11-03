import type { BookingStatus, PaymentStatus, SessionStatus } from "@workshop/shared";

/**
 * Booking state machine (REQUIREMENTS 6.1). Pure; mirrors the future backend `bookings/booking-state.ts`.
 * Booking status and payment status are independent (BR-06).
 */

export const LATE_RELEASE_AFTER_MINUTES = 30;

export type BookingAction = "CHECK_IN" | "UNDO_CHECK_IN" | "LATE_RELEASE" | "NO_SHOW" | "CANCEL" | "COMPLETE" | "RESCHEDULE";

export type BlockedReason =
  | "INVALID_STATE" // not allowed from the current status
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
  const s = booking.status;

  // A closed session is final: nobody is checked in or unchecked any more (its list is read-only).
  const closed = session.status === "CLOSED";

  const checkIn: ActionState =
    closed ? no("INVALID_STATE")
    : s === "CONFIRMED"
      ? ok()
      : s === "LATE_RELEASED"
        ? session.capacity - session.reservedCount >= booking.quantity ? ok() : no("SESSION_FULL")
        : no("INVALID_STATE");

  // Uncheck-in: a check-in made by mistake goes back to CONFIRMED (only before the booking is completed).
  const undoCheckIn: ActionState = s === "CHECKED_IN" && !closed ? ok() : no("INVALID_STATE");

  const lateRelease: ActionState =
    s !== "CONFIRMED" ? no("INVALID_STATE")
      : t >= starts + LATE_RELEASE_AFTER_MINUTES * 60_000 ? ok() : no("TOO_EARLY_LATE_RELEASE");

  // A guest who did not check in is marked SESSION_EXPIRED by the system when the session ends; the shop can then confirm the no-show.
  const noShow: ActionState =
    s === "SESSION_EXPIRED" ? ok()
      : s !== "CONFIRMED" ? no("INVALID_STATE") : t >= ends ? ok() : no("SESSION_NOT_ENDED");

  const cancel: ActionState = s === "CONFIRMED" ? ok({ requiresReason: true }) : no("INVALID_STATE");
  const complete: ActionState = s === "CHECKED_IN" ? ok() : no("INVALID_STATE");
  // FR-OPS-07 (Should): only CONFIRMED bookings may move.
  const reschedule: ActionState =
    s !== "CONFIRMED" ? no("INVALID_STATE") : ok();

  return { CHECK_IN: checkIn, UNDO_CHECK_IN: undoCheckIn, LATE_RELEASE: lateRelease, NO_SHOW: noShow, CANCEL: cancel, COMPLETE: complete, RESCHEDULE: reschedule };
}

export function allowedActions(booking: StateBooking, session: StateSession, now: Date): BookingAction[] {
  const states = canTransition(booking, session, now);
  return (Object.keys(states) as BookingAction[]).filter((a) => states[a].allowed);
}

const TARGET: Partial<Record<BookingAction, BookingStatus>> = {
  CHECK_IN: "CHECKED_IN", UNDO_CHECK_IN: "CONFIRMED", LATE_RELEASE: "LATE_RELEASED", NO_SHOW: "NO_SHOW", CANCEL: "CANCELLED", COMPLETE: "COMPLETED",
};

export function targetStatus(action: BookingAction): BookingStatus | undefined {
  return TARGET[action];
}

/**
 * The seats a session has taken, counted from its bookings (BR-07: only CONFIRMED, CHECKED_IN and COMPLETED bookings hold seats). A booking
 * that is cancelled stops counting at once, so "8 of 10 seats" becomes "7 of 10" the moment a guest cancels.
 */
export function reservedSeats(bookings: readonly { sessionId: string; status: BookingStatus; quantity: number }[], sessionId: string): number {
  return bookings.reduce((n, b) => (b.sessionId === sessionId && holdsSeat(b.status) ? n + b.quantity : n), 0);
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

/**
 * The system step at the end of a session: every booking that was not checked in (confirmed, or released for being late) becomes
 * SESSION_EXPIRED. Checked-in, completed, cancelled and no-show bookings keep their status.
 */
export function expiredStatus(status: BookingStatus, session: Pick<StateSession, "endsAt">, now: Date): BookingStatus {
  const notCheckedIn = status === "CONFIRMED" || status === "LATE_RELEASED";
  return notCheckedIn && new Date(session.endsAt).getTime() <= now.getTime() ? "SESSION_EXPIRED" : status;
}
