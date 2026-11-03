import type { SessionStatus } from "./enums";

// Life cycle of a session (shop owner, Sessions page):
//   OPEN --start--> RUNNING --pause--> PAUSED --start--> RUNNING (again)
//   PAUSED --close--> CLOSED
// A new session is OPEN (created, not running yet): it can only be started. A RUNNING session can only be paused (it never goes to
// another status directly). Only a RUNNING session can be booked by guests. CLOSED is final, except that a session the owner closed before
// it started can be re-opened (back to OPEN, see canReopenSession). There is no way to cancel a session.
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

/** Why the owner closes a session before it starts: a basic reason, or OTHER with a text that explains it. */
export const SESSION_CLOSE_REASONS = ["NOT_ENOUGH_GUESTS", "INSTRUCTOR_UNAVAILABLE", "VENUE_ISSUE", "SCHEDULE_CHANGE", "OTHER"] as const;
export type SessionCloseReasonCode = (typeof SESSION_CLOSE_REASONS)[number];
export const CLOSE_REASON_NOTE_MAX = 300;

export interface SessionCloseReason {
  code: SessionCloseReasonCode;
  /** Required (and only kept) for OTHER. */
  note?: string;
}

/** The reason as it will be stored (the note trimmed), or the problem: no valid code, or OTHER without an explanation. */
export function checkCloseReason(code: string, note: string): { ok: true; reason: SessionCloseReason } | { ok: false; error: "REQUIRED" | "NOTE_REQUIRED" | "NOTE_TOO_LONG" } {
  if (!(SESSION_CLOSE_REASONS as readonly string[]).includes(code)) return { ok: false, error: "REQUIRED" };
  if (code !== "OTHER") return { ok: true, reason: { code: code as SessionCloseReasonCode } };
  const text = note.trim();
  if (text === "") return { ok: false, error: "NOTE_REQUIRED" };
  if (text.length > CLOSE_REASON_NOTE_MAX) return { ok: false, error: "NOTE_TOO_LONG" };
  return { ok: true, reason: { code: "OTHER", note: text } };
}

export type RescheduleError = "NOT_PAUSED" | "ALREADY_RESCHEDULED" | "ENDED" | "SAME" | "PAST" | "DUPLICATE";

/**
 * Re-scheduling a paused session to a new start (the length of the session stays). A session can be re-scheduled only once (`rescheduled`). The new start must differ from the current one, be in the
 * future and not be the start of another session of the same workshop (`otherStarts`). Returns the new start and end.
 */
export function checkReschedule(
  s: { status: SessionStatus; startsAt: string; endsAt: string; rescheduled?: boolean },
  newStartsAt: string,
  now: Date,
  otherStarts: readonly string[],
): { ok: true; startsAt: string; endsAt: string } | { ok: false; error: RescheduleError } {
  if (s.status !== "PAUSED") return { ok: false, error: "NOT_PAUSED" };
  if (s.rescheduled) return { ok: false, error: "ALREADY_RESCHEDULED" };
  if (new Date(s.endsAt).getTime() <= now.getTime()) return { ok: false, error: "ENDED" };
  const next = new Date(newStartsAt).getTime();
  if (Number.isNaN(next) || next === new Date(s.startsAt).getTime()) return { ok: false, error: "SAME" };
  if (next <= now.getTime()) return { ok: false, error: "PAST" };
  if (otherStarts.some((o) => new Date(o).getTime() === next)) return { ok: false, error: "DUPLICATE" };
  const length = new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime();
  return { ok: true, startsAt: new Date(next).toISOString(), endsAt: new Date(next + length).toISOString() };
}

/** A session code is "SES-" and at least 4 digits: the code the owner uses to find and talk about a session. It never changes. */
export const SESSION_CODE_RE = /^SES-[0-9]{4,}$/;

/** The next free code of a shop: one more than the highest number used so far ("SES-0001" for the first session). */
export function nextSessionCode(codes: readonly string[]): string {
  const highest = codes.reduce((max, c) => (SESSION_CODE_RE.test(c) ? Math.max(max, Number(c.slice(4))) : max), 0);
  return `SES-${String(highest + 1).padStart(4, "0")}`;
}

/** A session is edited while it is Open or Paused; a Running session cannot be edited (pause it first) and a Closed one is final. */
export const canEditSession = (status: SessionStatus): boolean => status === "OPEN" || status === "PAUSED";

/** A session cannot be created (added or cloned) with a start in the past: it must start after `now`. */
export const isFutureStart = (startsAt: string, now: Date): boolean => {
  const t = Date.parse(startsAt);
  return !Number.isNaN(t) && t > now.getTime();
};

/**
 * A session the owner closed can be re-opened (it goes back to OPEN) while it has not started. A session the system closed because its time
 * was over (`autoClosed`), or one that has started, stays closed.
 */
export const canReopenSession = (s: { status: SessionStatus; startsAt: string; autoClosed?: boolean }, now: Date): boolean =>
  s.status === "CLOSED" && !s.autoClosed && new Date(s.startsAt).getTime() > now.getTime();
