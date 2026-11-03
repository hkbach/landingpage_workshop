import { describe, expect, it } from "vitest";
import { parseAmount } from "./parse-amount";

describe("parseAmount", () => {
  it("turns major units into minor units", () => {
    expect(parseAmount("1500", 0)).toBe(1500);
    expect(parseAmount("1,500.50", 2)).toBe(150_050);
    expect(parseAmount("  12 ", 2)).toBe(1200);
  });
  it("refuses anything that is not a positive amount with the decimals of the currency", () => {
    for (const bad of ["", "0", "-5", "abc", "1.234", "1e3"]) expect(parseAmount(bad, 2), bad).toBeNull();
    expect(parseAmount("1.5", 0)).toBeNull();
  });
});
