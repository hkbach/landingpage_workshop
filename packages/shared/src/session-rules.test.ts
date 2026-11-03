import { describe, expect, it } from "vitest";
import { SESSION_STATUSES } from "./enums";
import { allowedSessionActions, applySessionAction, closeIfEnded, DEFAULT_BOOKING_CUTOFF_MINUTES, isSessionBookable, isValidBookingCutoff, type SessionState } from "./session-rules";

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
