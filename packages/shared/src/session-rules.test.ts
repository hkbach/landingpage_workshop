import { describe, expect, it } from "vitest";
import { SESSION_STATUSES } from "./enums";
import { allowedSessionActions, applySessionAction, canEditSession, canRescheduleSession, canReopenSession, checkCloseReason, isFutureStart, checkReschedule, nextSessionCode, SESSION_CODE_RE, CLOSE_REASON_NOTE_MAX, closeIfEnded, closeWaitsForEnd, DEFAULT_BOOKING_CUTOFF_MINUTES, isInSessionTime, isSessionBookable, isValidBookingCutoff, type SessionState } from "./session-rules";

const s = (status: SessionState["status"]): SessionState => ({ status });

describe("session statuses", () => {
  it("are open, paused, running and closed: a session cannot be cancelled", () => expect([...SESSION_STATUSES]).toEqual(["OPEN", "PAUSED", "RUNNING", "CLOSED"]));
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
    for (const st of ["OPEN", "RUNNING", "PAUSED"] as const) expect(closeIfEnded(sess(st, "2026-11-03T09:59:00Z"), NOW)).toEqual({ status: "CLOSED", endsAt: "2026-11-03T09:59:00Z", autoClosed: true });
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
  it("Close waits for the end only while the session is taking place", () => {
    expect(closeWaitsForEnd(span("2026-11-03T09:00:00Z", "2026-11-03T11:00:00Z"), NOW)).toBe(true);
    expect(closeWaitsForEnd(span("2026-11-04T09:00:00Z", "2026-11-04T11:00:00Z"), NOW)).toBe(false);
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
  it("a session that was re-scheduled once cannot be re-scheduled again", () => {
    expect(checkReschedule({ ...paused, rescheduled: true }, "2026-11-07T14:00:00Z", NOW, [])).toEqual({ ok: false, error: "ALREADY_RESCHEDULED" });
    expect(checkReschedule({ ...paused, rescheduled: false }, "2026-11-07T14:00:00Z", NOW, []).ok).toBe(true);
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
