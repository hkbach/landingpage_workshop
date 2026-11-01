import { describe, expect, it } from "vitest";
import { expiredStatus } from "./booking-state";

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
