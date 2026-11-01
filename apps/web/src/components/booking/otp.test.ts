import { describe, expect, it } from "vitest";
import { cleanOtp, DEMO_OTP, isOtpComplete, verifyOtp } from "./otp";

describe("otp helpers", () => {
  it("keeps only the digits and cuts to 6", () => {
    expect(cleanOtp(" 12 34-56789 ")).toBe("123456");
    expect(cleanOtp("abc")).toBe("");
  });
  it("is complete with exactly 6 digits", () => {
    expect(isOtpComplete("123456")).toBe(true);
    expect(isOtpComplete("12345")).toBe(false);
  });
  it("the mock accepts only the demo code", async () => {
    expect(await verifyOtp("a@b.co", DEMO_OTP)).toBe(true);
    expect(await verifyOtp("a@b.co", "000000")).toBe(false);
  });
});
