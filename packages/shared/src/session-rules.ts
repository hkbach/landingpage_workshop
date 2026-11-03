import type { SessionStatus } from "./enums";

// Life cycle of a session (shop owner, Sessions page):
//   OPEN --start--> RUNNING --pause--> PAUSED --start--> RUNNING (again)
//   PAUSED --close--> CLOSED
// A new session is OPEN (created, not running yet): it can only be started. A RUNNING session can only be paused (it never goes to
// another status directly). Only a RUNNING session can be booked by guests. CLOSED is final, except that a session the owner closed before
// it started can be re-opened (back to OPEN, see canReopenSession). There is no way to cancel a session.
// A session whose end time has passed is closed by the system (see closeIfEnded). The owner then marks a session that took place COMPLETED
// (CLOSED --complete--> COMPLETED, see canCompleteSession); COMPLETED is final.

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
export function closeIfEnded<T extends { status: SessionStatus; endsAt: string; autoClosed?: boolean; notes?: SessionNote[] }>(s: T, now: Date): T {
  if (isSessionFinished(s.status) || new Date(s.endsAt).getTime() > now.getTime()) return s;
  // The automatic close is one more note of the history of the session (at the time its time was over).
  return { ...s, status: "CLOSED", autoClosed: true, notes: withNote(s.notes, { type: "AUTO_CLOSED", at: s.endsAt }) };
}

/** CLOSED and COMPLETED are the end of the life of a session: it cannot be booked, changed or re-scheduled any more. */
export const isSessionFinished = (status: SessionStatus): boolean => status === "CLOSED" || status === "COMPLETED";

/**
 * The owner can mark a session COMPLETED when it is CLOSED, its time is over and it was not held closed by a person (a session the owner or an
 * administrator closed before it started did not take place: its last close is not followed by a re-open).
 */
export function canCompleteSession(s: { status: SessionStatus; endsAt: string; notes?: readonly SessionNote[] }, now: Date): boolean {
  if (s.status !== "CLOSED" || new Date(s.endsAt).getTime() > now.getTime()) return false;
  const last = notesInOrder(s.notes).filter((n) => n.type === "CLOSED" || n.type === "REOPENED").at(-1);
  return last?.type !== "CLOSED";
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

export type RescheduleError = "NOT_RESCHEDULABLE" | "RESCHEDULE_LIMIT" | "ENDED" | "SAME" | "PAST" | "DUPLICATE";

/**
 * Re-scheduling an open or paused session to a new start (the length of the session stays). A session can be re-scheduled at most MAX_RESCHEDULES times (`reschedules` so far). The new start must differ from the current one, be in the
 * future and not be the start of another session of the same workshop (`otherStarts`). Returns the new start and end.
 */
export function checkReschedule(
  s: { status: SessionStatus; startsAt: string; endsAt: string; reschedules?: number },
  newStartsAt: string,
  now: Date,
  otherStarts: readonly string[],
): { ok: true; startsAt: string; endsAt: string } | { ok: false; error: RescheduleError } {
  if (!canRescheduleSession(s.status)) return { ok: false, error: "NOT_RESCHEDULABLE" };
  if ((s.reschedules ?? 0) >= MAX_RESCHEDULES) return { ok: false, error: "RESCHEDULE_LIMIT" };
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
export const canReopenSession = (s: { status: SessionStatus; startsAt: string; autoClosed?: boolean; notes?: readonly SessionNote[] }, now: Date): boolean =>
  s.status === "CLOSED" && !s.autoClosed && !closedForGood(s) && new Date(s.startsAt).getTime() > now.getTime();

/** An open or a paused session can be re-scheduled (once); a running one is paused first and a closed one is final. */
export const canRescheduleSession = (status: SessionStatus): boolean => status === "OPEN" || status === "PAUSED";

/**
 * What happened to a session, one note each time and never removed (tracking): the owner closed it (with the reason), re-scheduled it (with
 * the reason) or re-opened it. A note says when it happened.
 */
export type SessionNoteType = "CLOSED" | "RESCHEDULED" | "REOPENED" | "AUTO_CLOSED";
/** Who made a change: the shop owner (not set) or a system administrator. */
export type SessionNoteBy = "ADMIN";
export interface SessionNote {
  type: SessionNoteType;
  /** When it happened (ISO). */
  at: string;
  /** Why it was closed or re-scheduled (not for REOPENED or AUTO_CLOSED). */
  reason?: SessionCloseReason;
  /** Set when a system administrator made the change: the limits of the owner do not apply to it and it is not counted in them. */
  by?: SessionNoteBy;
}

/**
 * A session can be re-scheduled at most 3 times by its owner. The owner can click Close 4 times: the first 3 closes can be re-opened and the
 * 4th closes the session for good. Every time is a note of its history. A system administrator is not held to these limits (his notes do not count).
 */
export const MAX_RESCHEDULES = 3;
export const MAX_CLOSES = 4;
const countNotes = (notes: readonly SessionNote[] | undefined, type: SessionNoteType): number => notes?.filter((n) => n.type === type && n.by !== "ADMIN").length ?? 0;
export const rescheduleCount = (notes?: readonly SessionNote[]): number => countNotes(notes, "RESCHEDULED");
export const closeCount = (notes?: readonly SessionNote[]): number => countNotes(notes, "CLOSED");
export const canRescheduleAgain = (notes?: readonly SessionNote[]): boolean => rescheduleCount(notes) < MAX_RESCHEDULES;
export const canCloseAgain = (notes?: readonly SessionNote[]): boolean => closeCount(notes) < MAX_CLOSES;
/** The close the owner is about to make is the last one: the session will be closed for good. */
export const isFinalClose = (notes?: readonly SessionNote[]): boolean => closeCount(notes) === MAX_CLOSES - 1;
/** The owner has closed the session for good (all 4 closes used): only a system administrator can open it again. */
export const closedForGood = (s: { status: SessionStatus; notes?: readonly SessionNote[] }): boolean => s.status === "CLOSED" && closeCount(s.notes) >= MAX_CLOSES;
/** True when the session has been re-scheduled at least once. */
export const wasRescheduled = (notes?: readonly SessionNote[]): boolean => rescheduleCount(notes) > 0;

/** The notes in the order they happened (oldest first). */
export const notesInOrder = (notes?: readonly SessionNote[]): SessionNote[] => [...(notes ?? [])].sort((a, b) => a.at.localeCompare(b.at));

/** The notes with one more at the end: the earlier ones are kept. */
export const withNote = (notes: readonly SessionNote[] | undefined, note: SessionNote): SessionNote[] => [...(notes ?? []), note];

/**
 * What a system administrator can do, without the limits of the owner: close any session that is not closed yet (even one that is taking place or
 * closed for good before) and open any closed session that has not ended (even one closed for good). A session that has ended stays closed.
 */
export const canAdminClose = (s: { status: SessionStatus }): boolean => !isSessionFinished(s.status);
export const canAdminReopen = (s: { status: SessionStatus; endsAt: string }, now: Date): boolean => s.status === "CLOSED" && new Date(s.endsAt).getTime() > now.getTime();
