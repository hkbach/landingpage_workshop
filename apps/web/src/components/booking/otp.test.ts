import { describe, expect, it } from "vitest";
import { cleanOtp, isOtpComplete } from "./otp";

describe("otp helpers", () => {
  it("keeps only the digits and cuts to 6", () => {
    expect(cleanOtp(" 12 34-56789 ")).toBe("123456");
    expect(cleanOtp("abc")).toBe("");
  });
  it("is complete with exactly 6 digits", () => {
    expect(isOtpComplete("123456")).toBe(true);
    expect(isOtpComplete("12345")).toBe(false);
  });
});
