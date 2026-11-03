import { describe, expect, it } from "vitest";
import { SESSION_STATUSES } from "./enums";
import { allowedSessionActions, applySessionAction, DEFAULT_BOOKING_CUTOFF_MINUTES, isSessionBookable, isValidBookingCutoff, type SessionState } from "./session-rules";

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
