import { describe, expect, it } from "vitest";
import {
  bestTextOn, contrastRatio, deriveMuted, isHexColor, MIN_CONTRAST, mixHex, normalizeHex, shiftToContrast,
} from "./color";

describe("isHexColor / normalizeHex", () => {
  it.each(["#fff", "#FFF", "#abc", "#a1b2c3", "#A1B2C3", "#000000"])("accepts %s", (v) => {
    expect(isHexColor(v)).toBe(true);
    expect(normalizeHex(v)).toMatch(/^#[0-9a-f]{6}$/);
  });
  it.each(["", "fff", "#ff", "#ffff", "#fffff", "#fffffff", "#ggg", "#12345g", "red", "rgb(0,0,0)", "#fff;", " #fff", "#fff ", "url(x)", "#fff\n"])(
    "rejects %j", (v) => {
      expect(isHexColor(v)).toBe(false);
      expect(normalizeHex(v)).toBeNull();
    },
  );
  it("rejects non-strings", () => {
    expect(isHexColor(undefined)).toBe(false);
    expect(isHexColor(123)).toBe(false);
    expect(normalizeHex(null)).toBeNull();
  });
  it("expands and lower-cases", () => {
    expect(normalizeHex("#ABC")).toBe("#aabbcc");
    expect(normalizeHex("#9A3412")).toBe("#9a3412");
  });
});

describe("contrastRatio", () => {
  it("black on white is 21", () => expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5));
  it("is symmetric and 1 for equal colours", () => {
    expect(contrastRatio("#ffffff", "#000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
  it("matches known WCAG values", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(4.5); // 4.54
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(4.5); // 4.48
  });
  it("accepts shorthand hex", () => expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5));
  it("returns 0 for invalid input", () => {
    expect(contrastRatio("red", "#fff")).toBe(0);
    expect(contrastRatio("#fff", "")).toBe(0);
  });
});

describe("derived colours", () => {
  it("mixHex interpolates", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
  it("bestTextOn always reaches 4.5:1", () => {
    for (let r = 0; r < 256; r += 51) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 51) {
      const bg = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
      expect(contrastRatio(bestTextOn(bg), bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    }
  });
  it("bestTextOn prefers white on dark and dark on light", () => {
    expect(bestTextOn("#9a3412")).toBe("#ffffff");
    expect(bestTextOn("#fde68a")).toBe("#111111");
  });
  it("shiftToContrast reaches the minimum", () => {
    const c = shiftToContrast("#e5b94f", "#ffffff");
    expect(contrastRatio(c, "#ffffff")).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(shiftToContrast("#000000", "#ffffff")).toBe("#000000");
  });
  it("deriveMuted keeps contrast on every background", () => {
    const m = deriveMuted("#292524", ["#fffaf5", "#fff1e6"]);
    expect(contrastRatio(m, "#fffaf5")).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(m, "#fff1e6")).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });
});
