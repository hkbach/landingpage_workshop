import { describe, expect, it } from "vitest";
import { dayInBounds, formatDay, parseDay } from "./date-input";

const LOCALES = ["en", "vi", "ko", "ja", "zh"];

describe("formatDay", () => {
  it("writes a day in the order of the language", () => {
    expect(formatDay("2026-11-03", "en")).toBe("11/03/2026");
    expect(formatDay("2026-11-03", "vi")).toBe("03/11/2026");
    expect(formatDay("2026-11-03", "ko")).toBe("2026. 11. 03.");
    expect(formatDay("2026-11-03", "ja")).toBe("2026/11/03");
    expect(formatDay("2026-11-03", "zh")).toBe("2026/11/03");
  });
  it("an unknown language falls back to English; no day gives nothing", () => {
    expect(formatDay("2026-11-03", "fr")).toBe("11/03/2026");
    expect(formatDay("", "en")).toBe("");
    expect(formatDay("2026-02-30", "en")).toBe("");
  });
});

describe("parseDay", () => {
  it("reads what formatDay writes, in every language", () => {
    for (const l of LOCALES) for (const d of ["2026-11-03", "2024-02-29", "2026-12-31", "2026-01-01"]) expect(parseDay(formatDay(d, l), l), `${l} ${d}`).toBe(d);
  });
  it("reads the order of the language, so 03/11 is the 3rd of November in Vietnamese and March 11 in English", () => {
    expect(parseDay("03/11/2026", "vi")).toBe("2026-11-03");
    expect(parseDay("03/11/2026", "en")).toBe("2026-03-11");
    expect(parseDay("2026/03/11", "ja")).toBe("2026-03-11");
  });
  it("accepts other separators, no leading zero, and 8 digits", () => {
    expect(parseDay("3/11/2026", "vi")).toBe("2026-11-03");
    expect(parseDay("03-11-2026", "vi")).toBe("2026-11-03");
    expect(parseDay(" 03.11.2026 ", "vi")).toBe("2026-11-03");
    expect(parseDay("03112026", "vi")).toBe("2026-11-03");
    expect(parseDay("11032026", "en")).toBe("2026-11-03");
    expect(parseDay("20261103", "ko")).toBe("2026-11-03");
  });
  it("refuses what is not a real day or is not finished", () => {
    for (const bad of ["", "  ", "03/11", "03/11/26", "31/02/2026", "00/11/2026", "13/13/2026", "abc", "03/11/2026x", "1/2/3/4", "2026-1-"]) expect(parseDay(bad, "vi"), bad).toBeNull();
    expect(parseDay("02/29/2027", "en")).toBeNull();
    expect(parseDay("11/31/2026", "en")).toBeNull();
  });
});

describe("dayInBounds", () => {
  it("is inside when between the limits, both included", () => {
    expect(dayInBounds("2026-11-03", "2026-11-03", "2026-11-03")).toBe(true);
    expect(dayInBounds("2026-11-02", "2026-11-03", undefined)).toBe(false);
    expect(dayInBounds("2026-11-04", undefined, "2026-11-03")).toBe(false);
    expect(dayInBounds("2026-11-04")).toBe(true);
    expect(dayInBounds("")).toBe(false);
  });
});
