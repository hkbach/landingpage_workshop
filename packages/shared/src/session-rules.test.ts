import { describe, expect, it } from "vitest";
import { SESSION_STATUSES } from "./enums";
import { allowedSessionActions, applySessionAction, DEFAULT_BOOKING_CUTOFF_MINUTES, isSessionBookable, isValidBookingCutoff, type SessionState } from "./session-rules";

const s = (status: SessionState["status"], hasRun = true): SessionState => ({ status, hasRun });

describe("session statuses", () => {
  it("are open, paused, running, cancelled and closed", () => expect([...SESSION_STATUSES]).toEqual(["OPEN", "PAUSED", "RUNNING", "CANCELLED", "CLOSED"]));
});

describe("allowedSessionActions", () => {
  it("a new (open) session can only be started", () => expect(allowedSessionActions(s("OPEN", false), false)).toEqual(["start"]));
  it("a running session can only be paused, whatever its bookings", () => {
    expect(allowedSessionActions(s("RUNNING"), true)).toEqual(["pause"]);
    expect(allowedSessionActions(s("RUNNING"), false)).toEqual(["pause"]);
  });
  it("a paused session can be started again or closed", () => expect(allowedSessionActions(s("PAUSED", true), true)).toEqual(["start", "close"]));
  it("only a paused session that has run and has no bookings can also be cancelled", () => {
    expect(allowedSessionActions(s("PAUSED", true), false)).toEqual(["start", "close", "cancel"]);
    expect(allowedSessionActions(s("PAUSED", false), false)).toEqual(["start", "close"]); // never ran
  });
  it("closed and cancelled sessions are final", () => {
    expect(allowedSessionActions(s("CLOSED"), false)).toEqual([]);
    expect(allowedSessionActions(s("CANCELLED"), false)).toEqual([]);
  });
});

describe("applySessionAction", () => {
  it("starting sets the status and remembers that the session has run", () => {
    expect(applySessionAction(s("OPEN", false), "start", false)).toEqual({ status: "RUNNING", hasRun: true });
  });
  it("a paused session starts again, and one that ran can be cancelled", () => {
    expect(applySessionAction(s("PAUSED"), "start", true)).toEqual({ status: "RUNNING", hasRun: true });
    expect(applySessionAction(s("RUNNING"), "pause", true)).toEqual({ status: "PAUSED", hasRun: true });
    expect(applySessionAction(s("PAUSED"), "cancel", false)).toEqual({ status: "CANCELLED", hasRun: true });
  });
  it("returns null for an action that is not allowed", () => {
    expect(applySessionAction(s("RUNNING"), "close", false)).toBeNull();
    expect(applySessionAction(s("RUNNING"), "cancel", false)).toBeNull(); // a running session can only be paused
    expect(applySessionAction(s("OPEN", false), "close", false)).toBeNull();
    expect(applySessionAction(s("CLOSED"), "start", false)).toBeNull();
    expect(applySessionAction(s("OPEN", false), "cancel", false)).toBeNull();
  });
});

describe("isSessionBookable", () => {
  it("is true only for RUNNING", () => {
    expect(SESSION_STATUSES.filter(isSessionBookable)).toEqual(["RUNNING"]);
  });
});

describe("booking cut-off of a session", () => {
  it("is a whole number of minutes from 0 to a week, 120 by default", () => {
    expect(DEFAULT_BOOKING_CUTOFF_MINUTES).toBe(120);
    for (const ok of [0, 1, 120, 10_080]) expect(isValidBookingCutoff(ok), String(ok)).toBe(true);
    for (const bad of [-1, 10_081, 1.5, Number.NaN]) expect(isValidBookingCutoff(bad), String(bad)).toBe(false);
  });
});
