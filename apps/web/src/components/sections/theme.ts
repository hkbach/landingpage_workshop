import type { CSSProperties } from "react";
import {
  bestTextOn, contrastRatio, deriveMuted, isHexColor, MIN_CONTRAST, normalizeHex, shiftToContrast,
} from "@workshop/shared";
import type { PageTheme, SectionStyle, ThemeDensity, ThemeRadius } from "@/lib/types";

// Thin re-exports: the colour maths lives in @workshop/shared so the API can reuse it.
export { contrastRatio, isHexColor, luminance, MIN_CONTRAST, normalizeHex } from "@workshop/shared";

/** 6-digit hex (legacy import; prefer isHexColor / normalizeHex from shared). */
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
/** Contrast of the primary colour with white text. Returns 0 for an invalid hex. */
export function primaryContrast(primary: string): number {
  return contrastRatio(primary, "#ffffff");
}
export function isPrimaryAccessible(primary: string): boolean {
  return primaryContrast(primary) >= MIN_CONTRAST;
}

// ---------------------------------------------------------------------------------------------
// Palettes: presets that fill the theme colour tokens. Every palette passes the 4.5:1 checks below
// (enforced by templates.test.ts).
// ---------------------------------------------------------------------------------------------
export interface Palette { key: string; primary: string; background: string; surface: string; text: string }

export const PALETTES: Palette[] = [
  { key: "warm", primary: "#9a3412", background: "#fffaf5", surface: "#fff1e6", text: "#292524" },
  { key: "ocean", primary: "#0f5f8a", background: "#f6fbfe", surface: "#e4f2f9", text: "#0f172a" },
  { key: "forest", primary: "#2f6b3a", background: "#f7fbf6", surface: "#e6f2e4", text: "#14211a" },
  { key: "plum", primary: "#7e2a7a", background: "#fdf8fd", surface: "#f6e8f5", text: "#2a1429" },
  { key: "mono", primary: "#27272a", background: "#ffffff", surface: "#f4f4f5", text: "#18181b" },
  { key: "sunset", primary: "#b4232a", background: "#fffafa", surface: "#fdeaea", text: "#2b1517" },
  { key: "noir", primary: "#e5b94f", background: "#121214", surface: "#1e1e23", text: "#f4f4f5" },
  { key: "sage", primary: "#3b6a4b", background: "#f6f8f5", surface: "#e7eee6", text: "#1e2b22" },
  { key: "indigo", primary: "#2a3f7a", background: "#f8f6f0", surface: "#ebe7db", text: "#1f2430" },
  { key: "magenta", primary: "#a21caf", background: "#fffbff", surface: "#fbeafc", text: "#2b1030" },
];

export function findPalette(key: string): Palette {
  return PALETTES.find((p) => p.key === key) ?? PALETTES[0]!;
}

/** Theme colour tokens of a preset (used by the palette picker and by templates). */
export function paletteTokens(key: string): Pick<PageTheme, "palette" | "primary" | "background" | "surface" | "text"> {
  const p = findPalette(key);
  return { palette: p.key, primary: p.primary, background: p.background, surface: p.surface, text: p.text };
}

// ---------------------------------------------------------------------------------------------
// Fonts (max 6, FR-SITE-02). Loaded through next/font in `site-fonts.ts`, which exposes one CSS-variable class
// per font; the stacks below reference those variables and end in CJK/system fallbacks so VI/KO/JA glyphs render.
// ---------------------------------------------------------------------------------------------
export interface FontOption { key: string; label: string; stack: string; cssVar?: string }

// CJK fallbacks come from CSS variables so the glyph set follows the page language (globals.css sets
// --site-cjk-sans / --site-cjk-serif per [lang]); a fixed Japanese-first stack would draw Chinese with Japanese glyphs.
const CJK_SANS = "var(--site-cjk-sans)";
const CJK_SERIF = "var(--site-cjk-serif)";
const sans = (cssVar: string, name: string) => `var(${cssVar}, "${name}"), ${CJK_SANS}, system-ui, sans-serif`;
const serif = (cssVar: string, name: string) => `var(${cssVar}, "${name}"), ${CJK_SERIF}, Georgia, serif`;

export const FONTS: FontOption[] = [
  { key: "Inter", label: "Inter", cssVar: "--font-site-inter", stack: sans("--font-site-inter", "Inter") },
  { key: "Noto Sans", label: "Noto Sans", cssVar: "--font-site-noto-sans", stack: sans("--font-site-noto-sans", "Noto Sans") },
  { key: "Noto Serif", label: "Noto Serif", cssVar: "--font-site-noto-serif", stack: serif("--font-site-noto-serif", "Noto Serif") },
  { key: "Lora", label: "Lora", cssVar: "--font-site-lora", stack: serif("--font-site-lora", "Lora") },
  { key: "Poppins", label: "Poppins", cssVar: "--font-site-poppins", stack: sans("--font-site-poppins", "Poppins") },
  { key: "System", label: "System UI", stack: `system-ui, ${CJK_SANS}, sans-serif` },
];

export function findFont(key: string): FontOption {
  return FONTS.find((f) => f.key === key) ?? FONTS[0]!;
}

// ---------------------------------------------------------------------------------------------
// Resolved colours
// ---------------------------------------------------------------------------------------------
export interface ThemeColors { primary: string; background: string; surface: string; text: string }

/** Valid, normalised theme colours; unknown/invalid tokens fall back to the palette preset. */
export function resolveThemeColors(theme: Partial<PageTheme>): ThemeColors {
  const p = findPalette(theme.palette ?? "");
  return {
    primary: normalizeHex(theme.primary) ?? p.primary,
    background: normalizeHex(theme.background) ?? p.background,
    surface: normalizeHex(theme.surface) ?? p.surface,
    text: normalizeHex(theme.text) ?? p.text,
  };
}

/**
 * Where a section sits visually:
 * - bg / surface: page background or the alternate (surface) background; cards use the other one
 * - primary: filled with the primary colour (hero); inverse: filled with the text colour (footer)
 */
export type Tone = "bg" | "surface" | "primary" | "inverse";

export interface SectionColors { bg: string; card: string; text: string; muted: string; accent: string; accentFg: string }

/** Keeps only valid hex values, normalised. Anything else is dropped (never rendered). */
export function sanitizeSectionStyle(style: unknown): SectionStyle {
  const out: SectionStyle = {};
  if (!style || typeof style !== "object") return out;
  for (const k of ["background", "text", "accent"] as const) {
    const v = normalizeHex((style as Record<string, unknown>)[k]);
    if (v) out[k] = v;
  }
  return out;
}

/** Style keys that hold something other than a valid hex colour (used for validation messages). */
export function invalidStyleKeys(style: unknown): ("background" | "text" | "accent")[] {
  if (!style || typeof style !== "object") return [];
  const s = style as Record<string, unknown>;
  return (["background", "text", "accent"] as const).filter((k) => s[k] !== undefined && s[k] !== "" && !isHexColor(s[k]));
}

/**
 * Effective colours of a section. Unset overrides are derived so the defaults stay readable:
 * overriding only the background re-picks the text and accent if the template ones would fail.
 */
export function resolveSectionColors(theme: ThemeColors, tone: Tone, style?: SectionStyle): SectionColors {
  const s = sanitizeSectionStyle(style);
  const baseBg = tone === "bg" ? theme.background : tone === "surface" ? theme.surface : tone === "primary" ? theme.primary : theme.text;
  const bg = s.background ?? baseBg;
  const filled = tone === "primary" || tone === "inverse";
  // Cards sit on the opposite background; with a custom background they blend in and rely on their border.
  const card = filled || s.background ? bg : tone === "surface" ? theme.background : theme.surface;
  const text = s.text ?? (filled || s.background ? bestTextOn(bg) : theme.text);
  const accent = s.accent ?? (filled ? bestTextOn(bg) : contrastRatio(theme.primary, bg) >= MIN_CONTRAST ? theme.primary : bestTextOn(bg));
  return { bg, card, text, muted: deriveMuted(text, card === bg ? [bg] : [bg, card]), accent, accentFg: bestTextOn(accent) };
}

export type CheckId = "text" | "textCard" | "accent" | "accentCard" | "button" | "primary" | "primarySurface" | "textSurface";
export interface ContrastCheck { id: CheckId; fg: string; bg: string; ratio: number; ok: boolean; /** derived automatically, cannot fail */ auto?: boolean }

function check(id: CheckId, fg: string, bg: string, auto?: boolean): ContrastCheck {
  const ratio = contrastRatio(fg, bg);
  return { id, fg, bg, ratio, ok: ratio >= MIN_CONTRAST, ...(auto ? { auto } : {}) };
}

/** Contrast checks of the page-level colour tokens (blocks Publish/Submit when one fails). */
export function themeChecks(theme: Partial<PageTheme>): ContrastCheck[] {
  const c = resolveThemeColors(theme);
  return [
    check("text", c.text, c.background),
    check("textSurface", c.text, c.surface),
    check("primary", c.primary, c.background),
    check("primarySurface", c.primary, c.surface),
    check("button", bestTextOn(c.primary), c.primary, true),
  ];
}

/** Contrast checks of one section with its overrides (blocks Publish/Submit when one fails). */
export function sectionChecks(theme: ThemeColors, tone: Tone, style?: SectionStyle): ContrastCheck[] {
  const c = resolveSectionColors(theme, tone, style);
  const list = [check("text", c.text, c.bg)];
  if (c.card !== c.bg) list.push(check("textCard", c.text, c.card));
  list.push(check("accent", c.accent, c.bg));
  if (c.card !== c.bg) list.push(check("accentCard", c.accent, c.card));
  list.push(check("button", c.accentFg, c.accent, true));
  return list;
}

// ---------------------------------------------------------------------------------------------
// CSS variables (never arbitrary CSS: only validated hex and fixed keyword values reach the style attribute)
// ---------------------------------------------------------------------------------------------
const BORDER = "color-mix(in srgb, var(--site-text) 18%, transparent)";

const RADIUS: Record<ThemeRadius, { box: string; btn: string }> = {
  none: { box: "0px", btn: "0px" },
  sm: { box: "0.25rem", btn: "0.25rem" },
  md: { box: "0.5rem", btn: "0.5rem" },
  lg: { box: "0.875rem", btn: "0.75rem" },
  xl: { box: "1.5rem", btn: "9999px" },
};
const PAD: Record<ThemeDensity, string> = {
  compact: "clamp(2rem, 5vw, 3rem)",
  comfortable: "clamp(3rem, 7vw, 4.5rem)",
  spacious: "clamp(4rem, 10vw, 7rem)",
};

function colorVars(c: SectionColors): Record<string, string> {
  return {
    "--site-primary": c.accent,
    "--site-primary-fg": c.accentFg,
    "--site-bg": c.bg,
    "--site-surface": c.card,
    "--site-card": c.card,
    "--site-text": c.text,
    "--site-muted": c.muted,
    "--site-border": BORDER,
  };
}

/** Variables for a section wrapper: its own background, text, accent and the derived card/muted colours. */
export function sectionStyleVars(theme: ThemeColors, tone: Tone, style?: SectionStyle): CSSProperties {
  return colorVars(resolveSectionColors(theme, tone, style)) as CSSProperties;
}

/** Style attribute for the page wrapper: page tokens as CSS variables plus font family. */
export function themeStyle(theme: PageTheme): CSSProperties {
  const t = resolveThemeColors(theme);
  const base = resolveSectionColors(t, "bg");
  const radius = RADIUS[theme.radius ?? "md"] ?? RADIUS.md;
  return {
    ...colorVars(base),
    "--site-surface": t.surface,
    "--site-card": t.surface,
    "--site-radius": radius.box,
    "--site-btn-radius": radius.btn,
    "--site-pad": PAD[theme.density ?? "comfortable"] ?? PAD.comfortable,
    fontFamily: findFont(theme.font).stack,
    backgroundColor: t.background,
    color: t.text,
  } as CSSProperties;
}

/** Light, neutral surface for the booking modal (portal outside the page wrapper) with an accessible accent. */
export function modalThemeStyle(theme: PageTheme): CSSProperties {
  const t = resolveThemeColors(theme);
  const white = "#ffffff";
  const accent = shiftToContrast(t.primary, white);
  const radius = RADIUS[theme.radius ?? "md"] ?? RADIUS.md;
  return {
    "--site-primary": accent,
    "--site-primary-fg": bestTextOn(accent),
    "--site-bg": white,
    "--site-surface": "#f4f4f5",
    "--site-card": "#f4f4f5",
    "--site-text": "#18181b",
    "--site-muted": "#52525b",
    "--site-border": BORDER,
    "--site-radius": radius.box,
    "--site-btn-radius": radius.btn,
    fontFamily: findFont(theme.font).stack,
    backgroundColor: white,
    color: "#18181b",
  } as CSSProperties;
}
