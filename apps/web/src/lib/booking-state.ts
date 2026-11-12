// The booking state machine lives in packages/shared (the backend and this app use the same rules). This file keeps the old import path.
export {
  allowedActions, canTransition, computePaymentStatus, confirmation, holdsSeat, netPaid, reservedSeats, seatDelta, targetStatus,
} from "@workshop/shared";
export type { ActionState, BlockedReason, BookingAction, PaymentLike, PreCheckInStatus, StateBooking, StateSession } from "@workshop/shared";
