import { describe, expect, it } from "vitest";
import { SESSION_STATUSES } from "./enums";
import { allowedSessionActions, applySessionAction, isSessionBookable, type SessionState } from "./session-rules";

const s = (status: SessionState["status"], hasRun = true): SessionState => ({ status, hasRun });

describe("session statuses", () => {
  it("are paused, running, cancelled and closed", () => expect([...SESSION_STATUSES]).toEqual(["PAUSED", "RUNNING", "CANCELLED", "CLOSED"]));
});

describe("allowedSessionActions", () => {
  it("a paused session can be started or closed", () => expect(allowedSessionActions(s("PAUSED", false), true)).toEqual(["start", "close"]));
  it("a running session can be paused", () => expect(allowedSessionActions(s("RUNNING"), true)).toEqual(["pause"]));
  it("only a session that has run and has no bookings can be cancelled", () => {
    expect(allowedSessionActions(s("RUNNING"), false)).toEqual(["pause", "cancel"]);
    expect(allowedSessionActions(s("PAUSED", true), false)).toEqual(["start", "close", "cancel"]);
    expect(allowedSessionActions(s("PAUSED", false), false)).toEqual(["start", "close"]); // never ran
    expect(allowedSessionActions(s("RUNNING"), true)).not.toContain("cancel"); // has bookings
  });
  it("closed and cancelled sessions are final", () => {
    expect(allowedSessionActions(s("CLOSED"), false)).toEqual([]);
    expect(allowedSessionActions(s("CANCELLED"), false)).toEqual([]);
  });
});

describe("applySessionAction", () => {
  it("starting sets the status and remembers that the session has run", () => {
    expect(applySessionAction(s("PAUSED", false), "start", false)).toEqual({ status: "RUNNING", hasRun: true });
  });
  it("pausing keeps hasRun, and a paused session that ran can be cancelled", () => {
    expect(applySessionAction(s("RUNNING"), "pause", true)).toEqual({ status: "PAUSED", hasRun: true });
    expect(applySessionAction(s("PAUSED"), "cancel", false)).toEqual({ status: "CANCELLED", hasRun: true });
  });
  it("returns null for an action that is not allowed", () => {
    expect(applySessionAction(s("RUNNING"), "close", false)).toBeNull();
    expect(applySessionAction(s("CLOSED"), "start", false)).toBeNull();
    expect(applySessionAction(s("PAUSED", false), "cancel", false)).toBeNull();
  });
});

describe("isSessionBookable", () => {
  it("is true only for RUNNING", () => {
    expect(SESSION_STATUSES.filter(isSessionBookable)).toEqual(["RUNNING"]);
  });
});
