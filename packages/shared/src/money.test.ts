import { describe, expect, it } from "vitest";
import { parseMoney } from "./money";

describe("parseMoney", () => {
  it("takes whole numbers for a currency without decimals, with any separators between the thousands", () => {
    for (const text of ["1500000", "1,500,000", "1.500.000", " 1 500 000 "]) expect(parseMoney(text, "VND")).toBe(1_500_000);
    expect(parseMoney("0", "JPY")).toBe(0);
  });
  it("refuses what is not an amount", () => {
    for (const text of ["", " ", "abc", "-5", "12a", "1e5", "1,5,x", "9".repeat(16)]) expect(parseMoney(text, "VND"), text).toBeNull();
  });
  it("does not read a decimal typed for a currency without decimals as a thousands separator", () => {
    for (const text of ["12.5", "1.5", "1500.7", "1,50", "1.500,000", "1.500 000", "0x10"]) expect(parseMoney(text, "VND"), text).toBeNull();
    expect(parseMoney("12.500", "KRW")).toBe(12_500);
  });
  it("takes at most two decimals for a currency with decimals, and gives minor units", () => {
    expect(parseMoney("12", "USD")).toBe(1200);
    expect(parseMoney("12.5", "USD")).toBe(1250);
    expect(parseMoney("12,50", "USD")).toBe(1250);
    expect(parseMoney("0.07", "USD")).toBe(7);
    for (const text of ["12.555", "1,000.00", "-1", "x"]) expect(parseMoney(text, "USD"), text).toBeNull();
  });
});
