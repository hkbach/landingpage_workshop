import type { BookingStatus, PaymentStatus, SessionStatus } from "@workshop/shared";

/**
 * Booking state machine. Pure; mirrors the future backend `bookings/booking-state.ts`. Booking status and payment status are independent (BR-06).
 *
 *   NOT_CONFIRMED --(the guest opens the link of the email)--> CONFIRMED
 *   NOT_CONFIRMED | CONFIRMED --(check-in)--> CHECKED_IN --(uncheck-in)--> the status it had before the check-in
 *   NOT_CONFIRMED | CONFIRMED --(cancel)--> CANCELLED
 */

export type BookingAction = "CHECK_IN" | "UNDO_CHECK_IN" | "CANCEL" | "RESCHEDULE";

export type BlockedReason = "INVALID_STATE"; // not allowed from the current status (or the session is closed)

export interface ActionState {
  allowed: boolean;
  reason?: BlockedReason;
  /** Caller must collect a reason before executing (cancel). */
  requiresReason?: boolean;
}

/** The statuses a booking can have before it is checked in: an uncheck-in goes back to one of them. */
export type PreCheckInStatus = Extract<BookingStatus, "NOT_CONFIRMED" | "CONFIRMED">;

export interface StateBooking { status: BookingStatus; quantity: number; statusBeforeCheckIn?: PreCheckInStatus }
export interface StateSession {
  startsAt: string; endsAt: string; status: SessionStatus; capacity: number; reservedCount: number;
}

const ok = (extra?: Partial<ActionState>): ActionState => ({ allowed: true, ...extra });
const no = (reason: BlockedReason): ActionState => ({ allowed: false, reason });

/** Status that holds seats (BR-07): every booking but a cancelled one. */
export function holdsSeat(status: BookingStatus): boolean {
  return status !== "CANCELLED";
}

/** A booking that has not been checked in or cancelled yet. */
const isOpen = (s: BookingStatus): s is PreCheckInStatus => s === "NOT_CONFIRMED" || s === "CONFIRMED";

export function canTransition(booking: StateBooking, session: StateSession, _now: Date): Record<BookingAction, ActionState> {
  void _now;
  const s = booking.status;
  // A closed session is final: nobody is checked in or unchecked any more (its list is read-only).
  const closed = session.status === "CLOSED";

  // Check-in works from both NOT_CONFIRMED and CONFIRMED: a guest who has not opened the link yet can still arrive.
  const checkIn: ActionState = !closed && isOpen(s) ? ok() : no("INVALID_STATE");
  // Uncheck-in: a check-in made by mistake goes back to the status the booking had before it.
  const undoCheckIn: ActionState = s === "CHECKED_IN" && !closed ? ok() : no("INVALID_STATE");
  const cancel: ActionState = isOpen(s) ? ok({ requiresReason: true }) : no("INVALID_STATE");
  // FR-OPS-07 (Should): only a booking not checked in or cancelled may move.
  const reschedule: ActionState = isOpen(s) ? ok() : no("INVALID_STATE");

  return { CHECK_IN: checkIn, UNDO_CHECK_IN: undoCheckIn, CANCEL: cancel, RESCHEDULE: reschedule };
}

export function allowedActions(booking: StateBooking, session: StateSession, now: Date): BookingAction[] {
  const states = canTransition(booking, session, now);
  return (Object.keys(states) as BookingAction[]).filter((a) => states[a].allowed);
}

/**
 * The status an action leads to. An uncheck-in goes back to the status the booking had before the check-in (NOT_CONFIRMED or CONFIRMED; CONFIRMED when
 * it is not known).
 */
export function targetStatus(action: BookingAction, booking?: Pick<StateBooking, "statusBeforeCheckIn">): BookingStatus | undefined {
  switch (action) {
    case "CHECK_IN": return "CHECKED_IN";
    case "UNDO_CHECK_IN": return booking?.statusBeforeCheckIn ?? "CONFIRMED";
    case "CANCEL": return "CANCELLED";
    default: return undefined;
  }
}

/**
 * What the booking becomes when the guest opens the link of the confirmation email: NOT_CONFIRMED turns CONFIRMED; a booking already checked in
 * stays checked in but will go back to CONFIRMED (not NOT_CONFIRMED) if the check-in is undone. null when there is nothing to confirm (already
 * confirmed, or cancelled).
 */
export function confirmation(booking: Pick<StateBooking, "status" | "statusBeforeCheckIn">): { status: BookingStatus; statusBeforeCheckIn?: PreCheckInStatus } | null {
  if (booking.status === "NOT_CONFIRMED") return { status: "CONFIRMED" };
  if (booking.status === "CHECKED_IN" && booking.statusBeforeCheckIn === "NOT_CONFIRMED") return { status: "CHECKED_IN", statusBeforeCheckIn: "CONFIRMED" };
  return null;
}

/**
 * The seats a session has taken, counted from its bookings (BR-07: every booking that is not cancelled holds its seats). A booking that is
 * cancelled stops counting at once, so "8 of 10 seats" becomes "7 of 10" the moment a guest cancels.
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
  const net = netPaid(entries);
  return net > 0 && net >= totalAmount ? "PAID" : "UNPAID";
}

export function netPaid(entries: readonly PaymentLike[]): number {
  return entries.reduce((n, e) => n + (e.type === "PAYMENT" ? e.amount : -e.amount), 0);
}
