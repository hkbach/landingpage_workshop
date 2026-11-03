import { describe, expect, it } from "vitest";
import { BOOKING_CODE_RE, nextBookingCode } from "./booking-code";

describe("booking code", () => {
  it("is the session code and 3 digits", () => {
    expect(BOOKING_CODE_RE.test("SES-0003-042")).toBe(true);
    expect(BOOKING_CODE_RE.test("SES-12345-1000")).toBe(true);
    for (const bad of ["7K3M9QX2", "SES-0003", "SES-0003-42", "SES-003-042", "ses-0003-042"]) expect(BOOKING_CODE_RE.test(bad), bad).toBe(false);
  });
  it("starts at 001 for a session without bookings", () => expect(nextBookingCode("SES-0003", [])).toBe("SES-0003-001"));
  it("goes one past the highest number of that session only", () => {
    const taken = ["SES-0003-001", "SES-0003-007", "SES-0004-020", "garbage"];
    expect(nextBookingCode("SES-0003", taken)).toBe("SES-0003-008");
    expect(nextBookingCode("SES-0004", taken)).toBe("SES-0004-021");
    expect(nextBookingCode("SES-0005", taken)).toBe("SES-0005-001");
  });
  it("does not mistake SES-0003 for SES-00031", () => expect(nextBookingCode("SES-0003", ["SES-00031-005"])).toBe("SES-0003-001"));
  it("never goes below the seats already booked (atLeast), and the digits grow past 999", () => {
    expect(nextBookingCode("SES-0003", ["SES-0003-002"], 6)).toBe("SES-0003-006");
    expect(nextBookingCode("SES-0003", ["SES-0003-999"])).toBe("SES-0003-1000");
  });
});
