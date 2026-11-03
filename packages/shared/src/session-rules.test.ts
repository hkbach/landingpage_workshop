import { describe, expect, it } from "vitest";
import { SESSION_STATUSES } from "./enums";
import { openSessionCount } from "./workshop-rules";
import {
  allowedSessionActions, applySessionAction, canEditSession, canRescheduleSession, canReopenSession, checkCloseReason, checkReschedule, CLOSE_REASON_NOTE_MAX, closeIfEnded, closeReasonsFor, checkCloseReasonFor,
  DEFAULT_BOOKING_CUTOFF_MINUTES, isFutureStart, isInSessionTime, isSessionBookable, isValidBookingCutoff, nextSessionCode, notesInOrder, SESSION_CODE_RE, wasRescheduled, withNote,
  canCompleteSession, isSessionFinished, RESCHEDULE_REASONS, SESSION_CLOSE_REASONS, checkRescheduleReason, canAdminClose, canAdminReopen, canCloseAgain, canRescheduleAgain, closeCount, closedForGood, isFinalClose, MAX_CLOSES, MAX_RESCHEDULES, rescheduleCount,
  type SessionNote, type SessionState,
} from "./session-rules";

const s = (status: SessionState["status"]): SessionState => ({ status });

describe("session statuses", () => {
  it("are open, paused, running, closed and completed: a session cannot be cancelled", () => expect([...SESSION_STATUSES]).toEqual(["OPEN", "PAUSED", "RUNNING", "CLOSED", "COMPLETED"]));
});

describe("allowedSessionActions", () => {
  it("a new (open) session can only be started", () => expect(allowedSessionActions(s("OPEN"))).toEqual(["start"]));
  it("a running session can only be paused", () => expect(allowedSessionActions(s("RUNNING"))).toEqual(["pause"]));
  it("a paused session can be started again or closed", () => expect(allowedSessionActions(s("PAUSED"))).toEqual(["start", "close"]));
  it("a closed session is final", () => expect(allowedSessionActions(s("CLOSED"))).toEqual([]));
});

describe("applySessionAction", () => {
  it("follows the life cycle", () => {
    expect(applySessionAction(s("OPEN"), "start")).toEqual({ status: "RUNNING" });
    expect(applySessionAction(s("RUNNING"), "pause")).toEqual({ status: "PAUSED" });
    expect(applySessionAction(s("PAUSED"), "start")).toEqual({ status: "RUNNING" });
    expect(applySessionAction(s("PAUSED"), "close")).toEqual({ status: "CLOSED" });
  });
  it("returns null for an action that is not allowed", () => {
    expect(applySessionAction(s("OPEN"), "close")).toBeNull();
    expect(applySessionAction(s("RUNNING"), "close")).toBeNull();
    expect(applySessionAction(s("CLOSED"), "start")).toBeNull();
  });
});

describe("isSessionBookable", () => {
  it("is true only for RUNNING", () => expect(SESSION_STATUSES.filter(isSessionBookable)).toEqual(["RUNNING"]));
});

describe("booking cut-off of a session", () => {
  it("is a whole number of minutes from 0 to a week, 120 by default", () => {
    expect(DEFAULT_BOOKING_CUTOFF_MINUTES).toBe(120);
    for (const ok of [0, 1, 120, 10_080]) expect(isValidBookingCutoff(ok), String(ok)).toBe(true);
    for (const bad of [-1, 10_081, 1.5, Number.NaN]) expect(isValidBookingCutoff(bad), String(bad)).toBe(false);
  });
});

describe("closeIfEnded", () => {
  const NOW = new Date("2026-11-03T10:00:00Z");
  const sess = (status: SessionState["status"], endsAt: string) => ({ status, endsAt });
  it("closes an open, running or paused session whose end time has passed, and marks it as closed automatically", () => {
    for (const st of ["OPEN", "RUNNING", "PAUSED"] as const) expect(closeIfEnded(sess(st, "2026-11-03T09:59:00Z"), NOW)).toEqual({ status: "CLOSED", endsAt: "2026-11-03T09:59:00Z", autoClosed: true, notes: [{ type: "AUTO_CLOSED", at: "2026-11-03T09:59:00Z" }] });
    expect(closeIfEnded(sess("RUNNING", "2026-11-03T10:00:00Z"), NOW).status).toBe("CLOSED"); // ends exactly now
  });
  it("leaves a session that has not ended, and a session the owner already closed, as they are", () => {
    const live = sess("RUNNING", "2026-11-03T10:00:01Z");
    expect(closeIfEnded(live, NOW)).toBe(live);
    const closed = sess("CLOSED", "2026-11-01T10:00:00Z");
    expect(closeIfEnded(closed, NOW)).toBe(closed); // no autoClosed flag
  });
});

describe("closing a session during its time", () => {
  const NOW = new Date("2026-11-03T10:00:00Z");
  const span = (a: string, b: string) => ({ startsAt: a, endsAt: b });
  it("is in session time from the start until the end (end excluded)", () => {
    expect(isInSessionTime(span("2026-11-03T09:00:00Z", "2026-11-03T11:00:00Z"), NOW)).toBe(true);
    expect(isInSessionTime(span("2026-11-03T10:00:00Z", "2026-11-03T11:00:00Z"), NOW)).toBe(true); // starts now
    expect(isInSessionTime(span("2026-11-03T09:00:00Z", "2026-11-03T10:00:00Z"), NOW)).toBe(false); // ends now
    expect(isInSessionTime(span("2026-11-03T10:00:01Z", "2026-11-03T12:00:00Z"), NOW)).toBe(false); // not started
  });
  it("while the session is taking place it can only be closed because the workshop has been completed", () => {
    expect(closeReasonsFor(span("2026-11-03T09:00:00Z", "2026-11-03T11:00:00Z"), NOW)).toEqual(["WORKSHOP_COMPLETED"]);
  });
  it("before it starts it is closed for a basic reason or Other, not because the workshop has been completed", () => {
    expect(closeReasonsFor(span("2026-11-04T09:00:00Z", "2026-11-04T11:00:00Z"), NOW)).toEqual(["NOT_ENOUGH_GUESTS", "INSTRUCTOR_UNAVAILABLE", "VENUE_ISSUE", "SCHEDULE_CHANGE", "OTHER"]);
  });
  it("checkCloseReasonFor accepts a reason only at the time it is allowed", () => {
    const now = span("2026-11-03T09:00:00Z", "2026-11-03T11:00:00Z");
    const later = span("2026-11-04T09:00:00Z", "2026-11-04T11:00:00Z");
    expect(checkCloseReasonFor(now, NOW, "WORKSHOP_COMPLETED", "")).toEqual({ ok: true, reason: { code: "WORKSHOP_COMPLETED" } });
    expect(checkCloseReasonFor(now, NOW, "VENUE_ISSUE", "")).toEqual({ ok: false, error: "REQUIRED" });
    expect(checkCloseReasonFor(now, NOW, "OTHER", "text")).toEqual({ ok: false, error: "REQUIRED" });
    expect(checkCloseReasonFor(later, NOW, "WORKSHOP_COMPLETED", "")).toEqual({ ok: false, error: "REQUIRED" });
    expect(checkCloseReasonFor(later, NOW, "VENUE_ISSUE", "")).toEqual({ ok: true, reason: { code: "VENUE_ISSUE" } });
    expect(checkCloseReasonFor(later, NOW, "OTHER", "")).toEqual({ ok: false, error: "NOTE_REQUIRED" });
  });
});

describe("checkCloseReason", () => {
  it("accepts a basic reason without a text", () => expect(checkCloseReason("NOT_ENOUGH_GUESTS", "")).toEqual({ ok: true, reason: { code: "NOT_ENOUGH_GUESTS" } }));
  it("drops the note of a basic reason", () => expect(checkCloseReason("VENUE_ISSUE", "leftover")).toEqual({ ok: true, reason: { code: "VENUE_ISSUE" } }));
  it("OTHER needs a text, trimmed", () => {
    expect(checkCloseReason("OTHER", "   ")).toEqual({ ok: false, error: "NOTE_REQUIRED" });
    expect(checkCloseReason("OTHER", "  The kiln broke  ")).toEqual({ ok: true, reason: { code: "OTHER", note: "The kiln broke" } });
    expect(checkCloseReason("OTHER", "x".repeat(CLOSE_REASON_NOTE_MAX + 1))).toEqual({ ok: false, error: "NOTE_TOO_LONG" });
  });
  it("refuses an unknown or missing reason", () => {
    expect(checkCloseReason("", "")).toEqual({ ok: false, error: "REQUIRED" });
    expect(checkCloseReason("BORED", "")).toEqual({ ok: false, error: "REQUIRED" });
  });
});

describe("checkReschedule", () => {
  const NOW = new Date("2026-11-03T10:00:00Z");
  const paused = { status: "PAUSED" as const, startsAt: "2026-11-05T09:00:00Z", endsAt: "2026-11-05T11:30:00Z" };
  it("moves the start and keeps the length of the session", () => {
    expect(checkReschedule(paused, "2026-11-07T14:00:00Z", NOW, [])).toEqual({ ok: true, startsAt: "2026-11-07T14:00:00.000Z", endsAt: "2026-11-07T16:30:00.000Z" });
  });
  it("an open or a paused session can be re-scheduled; a running or a closed one cannot", () => {
    for (const st of ["OPEN", "PAUSED"] as const) expect(checkReschedule({ ...paused, status: st }, "2026-11-07T14:00:00Z", NOW, []).ok, st).toBe(true);
    for (const st of ["RUNNING", "CLOSED"] as const) expect(checkReschedule({ ...paused, status: st }, "2026-11-07T14:00:00Z", NOW, [])).toEqual({ ok: false, error: "NOT_RESCHEDULABLE" });
  });
  it("refuses the same start, a start in the past, a start that is not a date and a start already used by another session", () => {
    expect(checkReschedule(paused, "2026-11-05T09:00:00Z", NOW, [])).toEqual({ ok: false, error: "SAME" });
    expect(checkReschedule(paused, "nope", NOW, [])).toEqual({ ok: false, error: "SAME" });
    expect(checkReschedule(paused, "2026-11-03T09:00:00Z", NOW, [])).toEqual({ ok: false, error: "PAST" });
    expect(checkReschedule(paused, "2026-11-03T10:00:00Z", NOW, [])).toEqual({ ok: false, error: "PAST" });
    expect(checkReschedule(paused, "2026-11-07T14:00:00Z", NOW, ["2026-11-07T14:00:00Z"])).toEqual({ ok: false, error: "DUPLICATE" });
  });
  it("a session that has already ended cannot be re-scheduled", () => {
    expect(checkReschedule({ ...paused, startsAt: "2026-11-01T09:00:00Z", endsAt: "2026-11-01T11:00:00Z" }, "2026-11-07T14:00:00Z", NOW, [])).toEqual({ ok: false, error: "ENDED" });
  });
});

describe("one re-schedule per session", () => {
  const NOW = new Date("2026-11-03T10:00:00Z");
  const paused = { status: "PAUSED" as const, startsAt: "2026-11-05T09:00:00Z", endsAt: "2026-11-05T11:00:00Z" };
  it("a session can be re-scheduled 3 times and not a fourth", () => {
    for (const n of [0, 1, 2]) expect(checkReschedule({ ...paused, reschedules: n }, "2026-11-07T14:00:00Z", NOW, []).ok, String(n)).toBe(true);
    expect(checkReschedule({ ...paused, reschedules: 3 }, "2026-11-07T14:00:00Z", NOW, [])).toEqual({ ok: false, error: "RESCHEDULE_LIMIT" });
  });
});

describe("session codes", () => {
  it("start at SES-0001 and go one past the highest code", () => {
    expect(nextSessionCode([])).toBe("SES-0001");
    expect(nextSessionCode(["SES-0001", "SES-0009", "SES-0003"])).toBe("SES-0010");
    expect(nextSessionCode(["SES-9999"])).toBe("SES-10000");
  });
  it("ignore anything that is not a session code", () => expect(nextSessionCode(["x", "SES-12", "ses-0005"])).toBe("SES-0001"));
  it("have a format check", () => {
    expect(SESSION_CODE_RE.test("SES-0042")).toBe(true);
    expect(SESSION_CODE_RE.test("SES-42")).toBe(false);
  });
});

describe("canEditSession", () => {
  it("is true only for an open or a paused session", () => {
    expect(SESSION_STATUSES.filter(canEditSession)).toEqual(["OPEN", "PAUSED"]);
  });
});

describe("isFutureStart", () => {
  const NOW = new Date("2026-11-03T10:00:00Z");
  it("is true only for a start after now", () => {
    expect(isFutureStart("2026-11-03T10:00:01Z", NOW)).toBe(true);
    expect(isFutureStart("2026-11-03T10:00:00Z", NOW)).toBe(false);
    expect(isFutureStart("2026-11-02T10:00:00Z", NOW)).toBe(false);
    expect(isFutureStart("nope", NOW)).toBe(false);
  });
});

describe("canReopenSession", () => {
  const NOW = new Date("2026-11-03T10:00:00Z");
  const closed = { status: "CLOSED" as const, startsAt: "2026-11-05T09:00:00Z" };
  it("a session the owner closed before it started can be re-opened", () => expect(canReopenSession(closed, NOW)).toBe(true));
  it("not once it has started, and not when the system closed it", () => {
    expect(canReopenSession({ ...closed, startsAt: "2026-11-03T09:00:00Z" }, NOW)).toBe(false);
    expect(canReopenSession({ ...closed, startsAt: "2026-11-03T10:00:00Z" }, NOW)).toBe(false);
    expect(canReopenSession({ ...closed, autoClosed: true }, NOW)).toBe(false);
  });
  it("only a closed session", () => {
    for (const st of ["OPEN", "PAUSED", "RUNNING"] as const) expect(canReopenSession({ ...closed, status: st }, NOW), st).toBe(false);
  });
});

describe("canRescheduleSession", () => {
  it("is true only for an open or a paused session", () => expect(SESSION_STATUSES.filter(canRescheduleSession)).toEqual(["OPEN", "PAUSED"]));
});

describe("3 re-schedules and 4 closes per session", () => {
  const note = (type: SessionNote["type"], day: number): SessionNote => ({ type, at: `2026-11-0${day}T09:00:00Z`, ...(type === "CLOSED" || type === "RESCHEDULED" ? { reason: { code: "SCHEDULE_CHANGE" as const } } : {}) });
  it("3 re-schedules and 4 closes (the 4th for good)", () => expect([MAX_RESCHEDULES, MAX_CLOSES]).toEqual([3, 4]));
  it("count the re-schedules and the closes of the notes, and nothing else", () => {
    const notes = [note("CLOSED", 1), note("REOPENED", 2), note("RESCHEDULED", 3), note("CLOSED", 4), note("AUTO_CLOSED", 5)];
    expect(rescheduleCount(notes)).toBe(1);
    expect(closeCount(notes)).toBe(2);
  });
  it("allow a session until the third time", () => {
    expect(canRescheduleAgain([note("RESCHEDULED", 1), note("RESCHEDULED", 2)])).toBe(true);
    expect(canRescheduleAgain([note("RESCHEDULED", 1), note("RESCHEDULED", 2), note("RESCHEDULED", 3)])).toBe(false);
    expect(canCloseAgain([note("CLOSED", 1), note("CLOSED", 2), note("CLOSED", 3)])).toBe(true); // the 4th click
    expect(canCloseAgain([note("CLOSED", 1), note("CLOSED", 2), note("CLOSED", 3), note("CLOSED", 4)])).toBe(false);
    expect(canCloseAgain(undefined)).toBe(true);
  });
  it("the automatic close is a note of the history and does not count as a close of the owner", () => {
    const ended = closeIfEnded({ status: "RUNNING" as const, endsAt: "2026-11-01T11:00:00Z", notes: [note("CLOSED", 1)] }, new Date("2026-11-03T10:00:00Z"));
    expect(ended.notes!.map((n) => n.type)).toEqual(["CLOSED", "AUTO_CLOSED"]);
    expect(ended.notes![1]!.at).toBe("2026-11-01T11:00:00Z");
    expect(closeCount(ended.notes)).toBe(1);
  });
});

describe("the notes of a session", () => {
  const closed: SessionNote = { type: "CLOSED", at: "2026-11-03T10:00:00Z", reason: { code: "NOT_ENOUGH_GUESTS" } };
  const reopened: SessionNote = { type: "REOPENED", at: "2026-11-04T09:00:00Z" };
  const moved: SessionNote = { type: "RESCHEDULED", at: "2026-11-02T09:00:00Z", reason: { code: "SCHEDULE_CHANGE" } };
  it("add one more each time and keep the earlier ones", () => {
    const one = withNote(undefined, closed);
    const two = withNote(one, reopened);
    const three = withNote(two, { ...closed, at: "2026-11-05T10:00:00Z" });
    expect(three).toHaveLength(3);
    expect(three.slice(0, 2)).toEqual([closed, reopened]);
    expect(one).toHaveLength(1); // the list that was given is not changed
  });
  it("are listed in the order they happened", () => expect(notesInOrder([reopened, closed, moved]).map((n) => n.type)).toEqual(["RESCHEDULED", "CLOSED", "REOPENED"]));
  it("know when a session was re-scheduled", () => {
    expect(wasRescheduled(undefined)).toBe(false);
    expect(wasRescheduled([closed, reopened])).toBe(false);
    expect(wasRescheduled([closed, moved])).toBe(true);
  });
});

describe("the 4th close is for good", () => {
  const closes = (n: number): SessionNote[] => Array.from({ length: n }, (_, i) => ({ type: "CLOSED" as const, at: `2026-11-0${i + 1}T09:00:00Z`, reason: { code: "SCHEDULE_CHANGE" as const } }));
  const NOW = new Date("2026-11-03T10:00:00Z");
  const future = { startsAt: "2026-11-20T09:00:00Z", endsAt: "2026-11-20T11:00:00Z" };
  it("the first 3 closes can be re-opened, the 4th cannot", () => {
    for (const n of [1, 2, 3]) expect(canReopenSession({ status: "CLOSED", ...future, notes: closes(n) }, NOW), String(n)).toBe(true);
    expect(canReopenSession({ status: "CLOSED", ...future, notes: closes(4) }, NOW)).toBe(false);
  });
  it("the third close is followed by the final one", () => {
    expect(isFinalClose(closes(2))).toBe(false);
    expect(isFinalClose(closes(3))).toBe(true);
    expect(isFinalClose(closes(4))).toBe(false);
  });
  it("a session closed 4 times is closed for good", () => {
    expect(closedForGood({ status: "CLOSED", notes: closes(4) })).toBe(true);
    expect(closedForGood({ status: "CLOSED", notes: closes(3) })).toBe(false);
    expect(closedForGood({ status: "OPEN", notes: closes(4) })).toBe(false);
  });
  it("the closes of a system administrator are not counted", () => {
    const withAdmin: SessionNote[] = [...closes(2), { type: "CLOSED", at: "2026-11-03T08:00:00Z", by: "ADMIN", reason: { code: "OTHER", note: "x" } }];
    expect(closeCount(withAdmin)).toBe(2);
    expect(canCloseAgain([...closes(3), ...withAdmin.slice(2)])).toBe(true);
  });
});

describe("what a system administrator can do", () => {
  const NOW = new Date("2026-11-03T10:00:00Z");
  it("close any session that is not closed (also one that is taking place)", () => {
    for (const st of ["OPEN", "PAUSED", "RUNNING"] as const) expect(canAdminClose({ status: st }), st).toBe(true);
    expect(canAdminClose({ status: "CLOSED" })).toBe(false);
  });
  it("open any closed session that has not ended, also one closed for good, but not one that has ended", () => {
    expect(canAdminReopen({ status: "CLOSED", endsAt: "2026-11-20T11:00:00Z" }, NOW)).toBe(true);
    expect(canAdminReopen({ status: "CLOSED", endsAt: "2026-11-03T11:00:00Z" }, NOW)).toBe(true); // taking place
    expect(canAdminReopen({ status: "CLOSED", endsAt: "2026-11-02T11:00:00Z" }, NOW)).toBe(false);
    expect(canAdminReopen({ status: "OPEN", endsAt: "2026-11-20T11:00:00Z" }, NOW)).toBe(false);
  });
});

describe("Completed", () => {
  const NOW = new Date("2026-11-10T12:00:00Z");
  const ended = { endsAt: "2026-11-10T10:00:00Z" };
  it("CLOSED and COMPLETED are both finished; the others are not", () => {
    expect(isSessionFinished("CLOSED")).toBe(true);
    expect(isSessionFinished("COMPLETED")).toBe(true);
    for (const s of ["OPEN", "PAUSED", "RUNNING"] as const) expect(isSessionFinished(s)).toBe(false);
  });
  it("every closed session can be completed, whatever closed it and whether its time is over", () => {
    expect(canCompleteSession({ status: "CLOSED" })).toBe(true);
  });
  it("no other status can", () => {
    for (const st of ["OPEN", "PAUSED", "RUNNING", "COMPLETED"] as const) expect(canCompleteSession({ status: st }), st).toBe(false);
  });
  it("a completed session stays completed: the system does not close it again, and nothing can be done to it", () => {
    const s = { status: "COMPLETED" as const, ...ended };
    expect(closeIfEnded(s, NOW)).toBe(s);
    expect(allowedSessionActions(s)).toEqual([]);
    expect(canAdminClose(s)).toBe(false);
    expect(canEditSession("COMPLETED")).toBe(false);
    expect(canRescheduleSession("COMPLETED")).toBe(false);
  });
  it("a completed session is not an open one for the workshop", () => {
    expect(openSessionCount(["COMPLETED", "CLOSED"])).toBe(0);
    expect(openSessionCount(["COMPLETED", "RUNNING"])).toBe(1);
  });
});

describe("the reason that the workshop has been completed", () => {
  it("is one of the reasons of a close, before Other", () => {
    expect([...SESSION_CLOSE_REASONS]).toEqual(["NOT_ENOUGH_GUESTS", "INSTRUCTOR_UNAVAILABLE", "VENUE_ISSUE", "SCHEDULE_CHANGE", "WORKSHOP_COMPLETED", "OTHER"]);
    expect(checkCloseReason("WORKSHOP_COMPLETED", "")).toEqual({ ok: true, reason: { code: "WORKSHOP_COMPLETED" } });
  });
  it("needs no explanation and keeps none", () => {
    expect(checkCloseReason("WORKSHOP_COMPLETED", "  anything  ")).toEqual({ ok: true, reason: { code: "WORKSHOP_COMPLETED" } });
  });
  it("is not a reason to re-schedule a session", () => {
    expect(RESCHEDULE_REASONS).not.toContain("WORKSHOP_COMPLETED");
    expect([...RESCHEDULE_REASONS]).toEqual(["NOT_ENOUGH_GUESTS", "INSTRUCTOR_UNAVAILABLE", "VENUE_ISSUE", "SCHEDULE_CHANGE", "OTHER"]);
    expect(checkRescheduleReason("WORKSHOP_COMPLETED", "")).toEqual({ ok: false, error: "REQUIRED" });
    expect(checkRescheduleReason("VENUE_ISSUE", "")).toEqual({ ok: true, reason: { code: "VENUE_ISSUE" } });
    expect(checkRescheduleReason("OTHER", "")).toEqual({ ok: false, error: "NOTE_REQUIRED" });
  });
});
