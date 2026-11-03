import { describe, expect, it } from "vitest";
import { checkDateRange, MAX_RANGE_DAYS } from "@workshop/shared";
import { dateBounds } from "./date-bounds";

// The date pickers of the Income page grey out every day that would make an invalid range, like they do for the future.

const TODAY = "2026-11-03";

describe("dateBounds", () => {
  it("with no other end yet, only the future is out", () => {
    expect(dateBounds("", "", TODAY)).toEqual({ from: { min: undefined, max: TODAY }, to: { min: undefined, max: TODAY } });
  });
  it("From ends at To and starts 364 days before it", () => {
    const b = dateBounds("2026-01-01", "2026-06-30", TODAY);
    expect(b.from).toEqual({ min: "2025-07-01", max: "2026-06-30" });
  });
  it("To starts at From and ends 364 days after it, never after today", () => {
    expect(dateBounds("2026-01-01", "2026-06-30", TODAY).to).toEqual({ min: "2026-01-01", max: TODAY }); // 364 days after is past today
    expect(dateBounds("2025-01-01", "2025-02-01", TODAY).to).toEqual({ min: "2025-01-01", max: "2025-12-31" });
  });
  it("From never goes past today either", () => {
    expect(dateBounds("2026-01-01", "2026-12-31", TODAY).from.max).toBe(TODAY);
  });
  it("every day the pickers offer makes a valid range with the other end, and the day just outside does not", () => {
    const b = dateBounds("2026-01-01", "2026-06-30", TODAY);
    expect(checkDateRange(b.from.min!, "2026-06-30")).toBe("OK");
    expect(checkDateRange("2025-06-30", "2026-06-30")).toBe("TOO_LONG");
    const c = dateBounds("2025-01-01", "2025-02-01", TODAY);
    expect(checkDateRange("2025-01-01", c.to.max)).toBe("OK");
    expect(checkDateRange("2025-01-01", "2026-01-01")).toBe("TOO_LONG");
    expect(MAX_RANGE_DAYS).toBe(365);
  });
  it("ignores an end that is not a real day", () => {
    expect(dateBounds("2026-02-30", "nope", TODAY)).toEqual({ from: { min: undefined, max: TODAY }, to: { min: undefined, max: TODAY } });
  });
});
