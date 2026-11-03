import type { SessionStatus } from "./enums";

// Life cycle of a session (shop owner, Sessions page):
//   OPEN --start--> RUNNING --pause--> PAUSED --start--> RUNNING (again)
//   PAUSED --close--> CLOSED
// A new session is OPEN (created, not running yet): it can only be started. A RUNNING session can only be paused (it never goes to
// another status directly). Only a RUNNING session can be booked by guests. CLOSED is final. There is no way to cancel a session.
// A session whose end time has passed is closed by the system (see closeIfEnded).

/** Booking cut-off of a session: minutes before it starts at which online booking closes (0 = when it starts). */
export const DEFAULT_BOOKING_CUTOFF_MINUTES = 120;
export const MAX_BOOKING_CUTOFF_MINUTES = 10_080;
export const isValidBookingCutoff = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_BOOKING_CUTOFF_MINUTES;

export type SessionAction = "start" | "pause" | "close";

export interface SessionState {
  status: SessionStatus;
}

/** The status each action leads to. */
export const SESSION_ACTION_TARGET: Record<SessionAction, SessionStatus> = {
  start: "RUNNING",
  pause: "PAUSED",
  close: "CLOSED",
};

/** The actions the owner may take now. */
export function allowedSessionActions(s: SessionState): SessionAction[] {
  if (s.status === "OPEN") return ["start"];
  if (s.status === "RUNNING") return ["pause"];
  if (s.status === "PAUSED") return ["start", "close"];
  return [];
}

/** The session after an action, or null when the action is not allowed. */
export function applySessionAction(s: SessionState, action: SessionAction): SessionState | null {
  return allowedSessionActions(s).includes(action) ? { status: SESSION_ACTION_TARGET[action] } : null;
}

/** Guests can only book a RUNNING session. */
export const isSessionBookable = (status: SessionStatus): boolean => status === "RUNNING";

/**
 * The system closes a session once its time is over: any session that is not CLOSED yet and whose end time has passed is shown as CLOSED
 * with `autoClosed` set (so the screen can say it was closed automatically). A session the owner closed keeps no such flag.
 */
export function closeIfEnded<T extends { status: SessionStatus; endsAt: string; autoClosed?: boolean }>(s: T, now: Date): T {
  if (s.status === "CLOSED" || new Date(s.endsAt).getTime() > now.getTime()) return s;
  return { ...s, status: "CLOSED", autoClosed: true };
}

/** True while the session is taking place (it has started and not ended yet). */
export function isInSessionTime(s: { startsAt: string; endsAt: string }, now: Date): boolean {
  const t = now.getTime();
  return new Date(s.startsAt).getTime() <= t && t < new Date(s.endsAt).getTime();
}

/**
 * Close is not possible while the session is taking place: the owner has to wait until it ends (the system then closes it by itself,
 * see closeIfEnded). Before it starts, a paused session can be closed.
 */
export const closeWaitsForEnd = (s: { startsAt: string; endsAt: string }, now: Date): boolean => isInSessionTime(s, now);
