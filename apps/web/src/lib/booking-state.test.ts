import { describe, expect, it } from "vitest";
import { canTransition, expiredStatus, seatDelta, targetStatus } from "./booking-state";

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
