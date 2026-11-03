import { describe, expect, it } from "vitest";
import { BOOKING_STATUSES } from "@workshop/shared";
import { allowedActions, canTransition, confirmation, holdsSeat, reservedSeats, seatDelta, targetStatus } from "./booking-state";

const live = { startsAt: "2026-11-05T09:00:00Z", endsAt: "2026-11-05T11:00:00Z", status: "RUNNING" as const, capacity: 8, reservedCount: 3 };
const closed = { ...live, status: "CLOSED" as const };
const now = new Date("2026-11-05T09:30:00Z");

describe("the statuses of a booking", () => {
  it("are not confirmed, confirmed, checked in and cancelled", () => expect([...BOOKING_STATUSES]).toEqual(["NOT_CONFIRMED", "CONFIRMED", "CHECKED_IN", "CANCELLED"]));
});

describe("check-in", () => {
  it("works for a booking that is not confirmed yet and for a confirmed one", () => {
    for (const st of ["NOT_CONFIRMED", "CONFIRMED"] as const) expect(canTransition({ status: st, quantity: 2 }, live, now).CHECK_IN.allowed, st).toBe(true);
    expect(targetStatus("CHECK_IN")).toBe("CHECKED_IN");
  });
  it("does not work for a booking that is checked in or cancelled", () => {
    for (const st of ["CHECKED_IN", "CANCELLED"] as const) expect(canTransition({ status: st, quantity: 2 }, live, now).CHECK_IN.allowed, st).toBe(false);
  });
});

describe("uncheck-in", () => {
  it("is allowed only for a checked-in booking", () => {
    expect(canTransition({ status: "CHECKED_IN", quantity: 2 }, live, now).UNDO_CHECK_IN.allowed).toBe(true);
    for (const st of ["NOT_CONFIRMED", "CONFIRMED", "CANCELLED"] as const) expect(canTransition({ status: st, quantity: 2 }, live, now).UNDO_CHECK_IN.allowed, st).toBe(false);
  });
  it("goes back to the status the booking had before the check-in", () => {
    expect(targetStatus("UNDO_CHECK_IN", { statusBeforeCheckIn: "NOT_CONFIRMED" })).toBe("NOT_CONFIRMED");
    expect(targetStatus("UNDO_CHECK_IN", { statusBeforeCheckIn: "CONFIRMED" })).toBe("CONFIRMED");
  });
  it("goes back to confirmed when the status before is not known", () => {
    expect(targetStatus("UNDO_CHECK_IN")).toBe("CONFIRMED");
    expect(targetStatus("UNDO_CHECK_IN", {})).toBe("CONFIRMED");
  });
  it("keeps the seat of the booking", () => expect(seatDelta("CHECKED_IN", "CONFIRMED", 2)).toBe(0));
});

describe("cancel and re-schedule", () => {
  it("are possible for a booking that is not confirmed or confirmed, and cancel needs a reason", () => {
    for (const st of ["NOT_CONFIRMED", "CONFIRMED"] as const) {
      const s = canTransition({ status: st, quantity: 1 }, live, now);
      expect(s.CANCEL).toEqual({ allowed: true, requiresReason: true });
      expect(s.RESCHEDULE.allowed).toBe(true);
    }
    for (const st of ["CHECKED_IN", "CANCELLED"] as const) {
      const s = canTransition({ status: st, quantity: 1 }, live, now);
      expect(s.CANCEL.allowed, st).toBe(false);
      expect(s.RESCHEDULE.allowed, st).toBe(false);
    }
    expect(targetStatus("CANCEL")).toBe("CANCELLED");
  });
  it("there is no action for the statuses that were removed", () => {
    const keys = Object.keys(canTransition({ status: "CONFIRMED", quantity: 1 }, live, now));
    expect(keys.sort()).toEqual(["CANCEL", "CHECK_IN", "RESCHEDULE", "UNDO_CHECK_IN"]);
    expect(allowedActions({ status: "CHECKED_IN", quantity: 1 }, live, now)).toEqual(["UNDO_CHECK_IN"]);
  });
});

describe("the link of the confirmation email", () => {
  it("turns a not-confirmed booking into a confirmed one", () => expect(confirmation({ status: "NOT_CONFIRMED" })).toEqual({ status: "CONFIRMED" }));
  it("leaves a confirmed or cancelled booking alone (nothing to confirm)", () => {
    expect(confirmation({ status: "CONFIRMED" })).toBeNull();
    expect(confirmation({ status: "CANCELLED" })).toBeNull();
  });
  it("a booking checked in before it was confirmed stays checked in, and an uncheck-in will then go back to confirmed", () => {
    expect(confirmation({ status: "CHECKED_IN", statusBeforeCheckIn: "NOT_CONFIRMED" })).toEqual({ status: "CHECKED_IN", statusBeforeCheckIn: "CONFIRMED" });
    expect(confirmation({ status: "CHECKED_IN", statusBeforeCheckIn: "CONFIRMED" })).toBeNull();
    expect(confirmation({ status: "CHECKED_IN" })).toBeNull();
  });
});

describe("seats", () => {
  it("every booking holds its seats but a cancelled one", () => {
    for (const st of ["NOT_CONFIRMED", "CONFIRMED", "CHECKED_IN"] as const) expect(holdsSeat(st), st).toBe(true);
    expect(holdsSeat("CANCELLED")).toBe(false);
  });
  const list = [
    { sessionId: "a", status: "NOT_CONFIRMED" as const, quantity: 3 },
    { sessionId: "a", status: "CONFIRMED" as const, quantity: 2 },
    { sessionId: "a", status: "CHECKED_IN" as const, quantity: 1 },
    { sessionId: "a", status: "CANCELLED" as const, quantity: 4 },
    { sessionId: "b", status: "CONFIRMED" as const, quantity: 5 },
  ];
  it("adds up the guests of the bookings that hold seats, of that session only", () => {
    expect(reservedSeats(list, "a")).toBe(6);
    expect(reservedSeats(list, "b")).toBe(5);
    expect(reservedSeats(list, "c")).toBe(0);
  });
  it("frees the seats of a booking the moment it is cancelled", () => {
    const eight = [{ sessionId: "a", status: "CONFIRMED" as const, quantity: 5 }, { sessionId: "a", status: "NOT_CONFIRMED" as const, quantity: 3 }];
    expect(reservedSeats(eight, "a")).toBe(8);
    expect(reservedSeats([{ ...eight[0]!, status: "CANCELLED" as const }, eight[1]!], "a")).toBe(3);
  });
});

describe("a closed session", () => {
  const later = new Date("2026-11-04T09:00:00Z");
  it("checks nobody in and unchecks nobody: its list is read-only", () => {
    expect(canTransition({ status: "CONFIRMED", quantity: 2 }, closed, later).CHECK_IN.allowed).toBe(false);
    expect(canTransition({ status: "NOT_CONFIRMED", quantity: 1 }, closed, later).CHECK_IN.allowed).toBe(false);
    expect(canTransition({ status: "CHECKED_IN", quantity: 2 }, closed, later).UNDO_CHECK_IN.allowed).toBe(false);
  });
});
