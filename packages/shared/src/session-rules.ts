import type { SessionStatus } from "./enums";

// Life cycle of a session (shop owner, Sessions page):
//   OPEN --start--> RUNNING --pause--> PAUSED --start--> RUNNING (again)
//   PAUSED --close--> CLOSED
//   PAUSED --cancel--> CANCELLED, only for a session that has run and has no bookings.
// A new session is OPEN (created, not running yet): it can only be started. A RUNNING session can only be paused (it never goes to another
// status directly). Only a RUNNING session can be booked by guests. CLOSED and CANCELLED are final.

/** Booking cut-off of a session: minutes before it starts at which online booking closes (0 = when it starts). */
export const DEFAULT_BOOKING_CUTOFF_MINUTES = 120;
export const MAX_BOOKING_CUTOFF_MINUTES = 10_080;
export const isValidBookingCutoff = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_BOOKING_CUTOFF_MINUTES;

export type SessionAction = "start" | "pause" | "close" | "cancel";

export interface SessionState {
  status: SessionStatus;
  /** True once the session has been RUNNING at least once. */
  hasRun: boolean;
}

/** The status each action leads to. */
export const SESSION_ACTION_TARGET: Record<SessionAction, SessionStatus> = {
  start: "RUNNING",
  pause: "PAUSED",
  close: "CLOSED",
  cancel: "CANCELLED",
};

/** The actions the owner may take now. `hasBookings`: a booking that is not cancelled exists for the session. */
export function allowedSessionActions(s: SessionState, hasBookings: boolean): SessionAction[] {
  const out: SessionAction[] = [];
  if (s.status === "OPEN") out.push("start");
  if (s.status === "RUNNING") out.push("pause");
  if (s.status === "PAUSED") {
    out.push("start", "close");
    if (s.hasRun && !hasBookings) out.push("cancel");
  }
  return out;
}

/** The session after an action, or null when the action is not allowed. */
export function applySessionAction(s: SessionState, action: SessionAction, hasBookings: boolean): SessionState | null {
  if (!allowedSessionActions(s, hasBookings).includes(action)) return null;
  const status = SESSION_ACTION_TARGET[action];
  return { status, hasRun: s.hasRun || status === "RUNNING" };
}

/** Guests can only book a RUNNING session. */
export const isSessionBookable = (status: SessionStatus): boolean => status === "RUNNING";
