import type { CSSProperties } from "react";
import type { PageTheme } from "@/lib/types";

export interface Palette { key: string; label: string; primary: string; bg: string; surface: string; text: string; muted: string }

// Text colours were chosen to keep >= 4.5:1 against their backgrounds.
export const PALETTES: Palette[] = [
  { key: "warm", label: "Warm clay", primary: "#9a3412", bg: "#fffaf5", surface: "#fff1e6", text: "#292524", muted: "#57534e" },
  { key: "ocean", label: "Ocean", primary: "#0f5f8a", bg: "#f6fbfe", surface: "#e4f2f9", text: "#0f172a", muted: "#475569" },
  { key: "forest", label: "Forest", primary: "#2f6b3a", bg: "#f7fbf6", surface: "#e6f2e4", text: "#14211a", muted: "#44544a" },
  { key: "plum", label: "Plum", primary: "#7e2a7a", bg: "#fdf8fd", surface: "#f6e8f5", text: "#2a1429", muted: "#5b4a5a" },
  { key: "mono", label: "Monochrome", primary: "#27272a", bg: "#ffffff", surface: "#f4f4f5", text: "#18181b", muted: "#52525b" },
  { key: "sunset", label: "Sunset", primary: "#b4232a", bg: "#fffafa", surface: "#fdeaea", text: "#2b1517", muted: "#5f4b4c" },
];

export interface FontOption { key: string; label: string; stack: string }
const CJK = `"Noto Sans", "Noto Sans CJK JP", "Noto Sans KR", "Malgun Gothic", "Hiragino Sans", "Yu Gothic"`;
// Max 6 fonts (FR-SITE-02). All stacks end with CJK/system fallbacks so VI/KO/JA glyphs render.
export const FONTS: FontOption[] = [
  { key: "Inter", label: "Inter", stack: `Inter, ${CJK}, system-ui, sans-serif` },
  { key: "Noto Sans", label: "Noto Sans", stack: `${CJK}, system-ui, sans-serif` },
  { key: "Noto Serif", label: "Noto Serif", stack: `"Noto Serif", "Noto Serif CJK JP", "Noto Serif KR", "Yu Mincho", Georgia, serif` },
  { key: "Lora", label: "Lora", stack: `Lora, "Noto Serif", "Yu Mincho", Georgia, serif` },
  { key: "Poppins", label: "Poppins", stack: `Poppins, ${CJK}, system-ui, sans-serif` },
  { key: "System", label: "System UI", stack: `system-ui, ${CJK}, sans-serif` },
];

export const HEX_RE = /^#[0-9a-fA-F]{6}$/;
export const MIN_CONTRAST = 4.5;

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
/** WCAG contrast ratio between two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
/** Contrast of the primary colour with white text (used on buttons). Returns 0 for an invalid hex. */
export function primaryContrast(primary: string): number {
  return HEX_RE.test(primary) ? contrastRatio(primary, "#ffffff") : 0;
}
export function isPrimaryAccessible(primary: string): boolean {
  return primaryContrast(primary) >= MIN_CONTRAST;
}

/** Inline style carrying the theme as CSS variables (no shop CSS is ever injected). */
export function themeStyle(theme: PageTheme): CSSProperties {
  const palette = PALETTES.find((p) => p.key === theme.palette) ?? PALETTES[0]!;
  const font = FONTS.find((f) => f.key === theme.font) ?? FONTS[0]!;
  const primary = HEX_RE.test(theme.primary) ? theme.primary : palette.primary;
  return {
    "--site-primary": primary,
    "--site-primary-fg": "#ffffff",
    "--site-bg": palette.bg,
    "--site-surface": palette.surface,
    "--site-text": palette.text,
    "--site-muted": palette.muted,
    fontFamily: font.stack,
    backgroundColor: palette.bg,
    color: palette.text,
  } as CSSProperties;
}
