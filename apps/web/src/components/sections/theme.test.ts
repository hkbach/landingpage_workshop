import { describe, expect, it } from "vitest";
import { contrastRatio, isHexColor, normalizeHex } from "@workshop/shared";
import {
  contrastRatio as reContrast, isHexColor as reIsHex, normalizeHex as reNormalize, resolveSectionColors,
  resolveThemeColors, sanitizeSectionStyle, sectionChecks, sectionStyleVars, themeChecks, themeStyle, invalidStyleKeys,
  MIN_CONTRAST, PALETTES, FONTS,
} from "./theme";
import { paletteTokens } from "./theme";

describe("thin re-exports of the shared colour helpers", () => {
  it("are the same functions", () => {
    expect(reContrast).toBe(contrastRatio);
    expect(reIsHex).toBe(isHexColor);
    expect(reNormalize).toBe(normalizeHex);
  });
});

describe("palettes", () => {
  it("every palette passes the 4.5:1 checks", () => {
    for (const p of PALETTES) {
      const failing = themeChecks({ ...paletteTokens(p.key), font: "Inter" }).filter((c) => !c.ok);
      expect(failing, `${p.key}: ${failing.map((c) => `${c.id}=${c.ratio.toFixed(2)}`).join(", ")}`).toEqual([]);
    }
  });
  it("at most 6 fonts and each has VI/KO/JA capable fallbacks", () => {
    expect(FONTS.length).toBeLessThanOrEqual(6);
    for (const f of FONTS) expect(f.stack).toMatch(/Malgun Gothic|Noto Serif KR|Noto Serif CJK/);
  });
});

describe("section colours", () => {
  const theme = resolveThemeColors(paletteTokens("warm"));

  it("ignores invalid hex and never emits it", () => {
    expect(sanitizeSectionStyle({ background: "red", text: "#FFF", accent: "javascript:1" })).toEqual({ text: "#ffffff" });
    expect(invalidStyleKeys({ background: "red", text: "#fff" })).toEqual(["background"]);
    const vars = sectionStyleVars(theme, "bg", { background: "url(x);color:red" as string }) as Record<string, string>;
    for (const v of Object.values(vars)) expect(v).not.toContain("url(");
  });

  it("unmodified sections pass for every tone", () => {
    for (const tone of ["bg", "surface", "primary", "inverse"] as const) {
      expect(sectionChecks(theme, tone).filter((c) => !c.ok), tone).toEqual([]);
    }
  });

  it("a background-only override re-picks text and accent to stay readable", () => {
    const dark = resolveSectionColors(theme, "bg", { background: "#101010" });
    expect(contrastRatio(dark.text, dark.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(contrastRatio(dark.accent, dark.bg)).toBeGreaterThanOrEqual(MIN_CONTRAST);
  });

  it("flags explicit low-contrast combinations", () => {
    const checks = sectionChecks(theme, "bg", { background: "#ffffff", text: "#cccccc" });
    expect(checks.find((c) => c.id === "text")?.ok).toBe(false);
  });

  it("flags a theme with low contrast text", () => {
    const bad = themeChecks({ ...paletteTokens("mono"), text: "#cccccc" });
    expect(bad.some((c) => !c.ok)).toBe(true);
  });

  it("themeStyle exposes only css variables, font and the two base colours", () => {
    const style = themeStyle({ ...paletteTokens("noir"), font: "Lora", radius: "xl", density: "spacious" }) as Record<string, string>;
    expect(style["--site-bg"]).toBe("#121214");
    expect(style["--site-btn-radius"]).toBe("9999px");
    expect(style.fontFamily).toContain("--font-site-lora");
  });
});
