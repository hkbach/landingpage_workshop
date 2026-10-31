import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  it("at most 6 fonts and each falls back to the language-dependent CJK stack", () => {
    expect(FONTS.length).toBeLessThanOrEqual(6);
    for (const f of FONTS) expect(f.stack).toMatch(/var\(--site-cjk-(sans|serif)\)/);
  });

  it("globals.css orders CJK fonts by page language (ja, ko, zh) with the right regional fonts first", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const rule = (lang: string) => css.match(new RegExp(`\\[lang="${lang}"\\]\\s*\\{([^}]*)\\}`))?.[1] ?? "";
    const firstSans = (lang: string) => rule(lang).match(/--site-cjk-sans:\s*var\((--[a-z]+-sans)\)/)?.[1];
    expect(firstSans("ja")).toBe("--jp-sans");
    expect(firstSans("ko")).toBe("--kr-sans");
    expect(firstSans("zh")).toBe("--sc-sans");
    // Chinese text may be Simplified or Traditional: the Traditional fonts must stay in the fallback list.
    expect(rule("zh")).toContain("var(--tc-sans)");
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
