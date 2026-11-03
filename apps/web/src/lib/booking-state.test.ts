import { describe, expect, it } from "vitest";
import { canTransition, expiredStatus, reservedSeats, seatDelta, targetStatus } from "./booking-state";

const session = { endsAt: "2026-11-01T11:00:00Z" };
const before = new Date("2026-11-01T10:59:00Z");
const after = new Date("2026-11-01T11:00:00Z");

describe("expiredStatus", () => {
  it("turns a booking that was not checked in into SESSION_EXPIRED once the session has ended", () => {
    expect(expiredStatus("CONFIRMED", session, after)).toBe("SESSION_EXPIRED");
    expect(expiredStatus("LATE_RELEASED", session, after)).toBe("SESSION_EXPIRED");
  });
  it("leaves every booking alone while the session has not ended", () => {
    expect(expiredStatus("CONFIRMED", session, before)).toBe("CONFIRMED");
  });
  it("keeps the other statuses", () => {
    for (const s of ["CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] as const) expect(expiredStatus(s, session, after)).toBe(s);
  });
});

describe("uncheck-in", () => {
  const live = { startsAt: "2026-11-05T09:00:00Z", endsAt: "2026-11-05T11:00:00Z", status: "RUNNING" as const, capacity: 8, reservedCount: 3 };
  const now = new Date("2026-11-05T09:30:00Z");
  it("is allowed only for a checked-in booking, and goes back to CONFIRMED", () => {
    expect(canTransition({ status: "CHECKED_IN", quantity: 2 }, live, now).UNDO_CHECK_IN.allowed).toBe(true);
    expect(targetStatus("UNDO_CHECK_IN")).toBe("CONFIRMED");
    for (const st of ["CONFIRMED", "COMPLETED", "CANCELLED", "NO_SHOW", "LATE_RELEASED", "SESSION_EXPIRED"] as const) {
      expect(canTransition({ status: st, quantity: 2 }, live, now).UNDO_CHECK_IN.allowed, st).toBe(false);
    }
  });
  it("keeps the seat of the booking", () => expect(seatDelta("CHECKED_IN", "CONFIRMED", 2)).toBe(0));
});

describe("reservedSeats", () => {
  const list = [
    { sessionId: "a", status: "CONFIRMED" as const, quantity: 3 },
    { sessionId: "a", status: "CHECKED_IN" as const, quantity: 2 },
    { sessionId: "a", status: "COMPLETED" as const, quantity: 1 },
    { sessionId: "a", status: "CANCELLED" as const, quantity: 4 },
    { sessionId: "a", status: "LATE_RELEASED" as const, quantity: 1 },
    { sessionId: "b", status: "CONFIRMED" as const, quantity: 5 },
  ];
  it("adds up the guests of the bookings that hold seats, of that session only", () => {
    expect(reservedSeats(list, "a")).toBe(6);
    expect(reservedSeats(list, "b")).toBe(5);
    expect(reservedSeats(list, "c")).toBe(0);
  });
  it("frees the seats of a booking the moment it is cancelled", () => {
    const eight = [{ sessionId: "a", status: "CONFIRMED" as const, quantity: 5 }, { sessionId: "a", status: "CONFIRMED" as const, quantity: 3 }];
    expect(reservedSeats(eight, "a")).toBe(8);
    expect(reservedSeats([{ ...eight[0]!, status: "CANCELLED" as const }, eight[1]!], "a")).toBe(3);
    expect(reservedSeats([eight[0]!, { ...eight[1]!, status: "CANCELLED" as const, quantity: 1 }], "a")).toBe(5);
  });
});

describe("a closed session", () => {
  const closed = { startsAt: "2026-11-05T09:00:00Z", endsAt: "2026-11-05T11:00:00Z", status: "CLOSED" as const, capacity: 8, reservedCount: 3 };
  const now = new Date("2026-11-04T09:00:00Z");
  it("checks nobody in and unchecks nobody: its list is read-only", () => {
    expect(canTransition({ status: "CONFIRMED", quantity: 2 }, closed, now).CHECK_IN.allowed).toBe(false);
    expect(canTransition({ status: "LATE_RELEASED", quantity: 1 }, closed, now).CHECK_IN.allowed).toBe(false);
    expect(canTransition({ status: "CHECKED_IN", quantity: 2 }, closed, now).UNDO_CHECK_IN.allowed).toBe(false);
  });
  it("does not stop the others", () => {
    expect(canTransition({ status: "CHECKED_IN", quantity: 2 }, closed, now).COMPLETE.allowed).toBe(true);
  });
});
