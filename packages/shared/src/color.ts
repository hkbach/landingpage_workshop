// Colour helpers shared by the web builder and (later) the API. Hex only: #RGB or #RRGGBB.

export const MIN_CONTRAST = 4.5;

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_RE.test(value);
}

/** Canonical lower-case #rrggbb, or null when `value` is not a valid hex colour. */
export function normalizeHex(value: unknown): string | null {
  if (!isHexColor(value)) return null;
  const h = value.slice(1).toLowerCase();
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return `#${full}`;
}

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(normalizeHex(hex)!.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: readonly number[]): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

function channel(v: number): number {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. Throws for invalid hex (callers validate first). */
export function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two hex colours (1..21). Returns 0 when either colour is invalid. */
export function contrastRatio(a: string, b: string): number {
  if (!isHexColor(a) || !isHexColor(b)) return 0;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mix `a` with `b`; `t` is the share of `b` (0..1). */
export function mixHex(a: string, b: string, t: number): string {
  const x = toRgb(a), y = toRgb(b);
  return toHex(x.map((v, i) => v + (y[i]! - v) * t));
}

/** Readable text colour on `bg`: white, then near-black, then pure black (always >= 4.5:1). */
export function bestTextOn(bg: string): string {
  for (const c of ["#ffffff", "#111111"]) if (contrastRatio(c, bg) >= MIN_CONTRAST) return c;
  return "#000000";
}

/** Move `fg` towards black or white (whichever helps) until it reaches `min` contrast on `bg`. */
export function shiftToContrast(fg: string, bg: string, min = MIN_CONTRAST): string {
  if (contrastRatio(fg, bg) >= min) return fg;
  const target = luminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let t = 0.05; t <= 1.0001; t += 0.05) {
    const c = mixHex(fg, target, t);
    if (contrastRatio(c, bg) >= min) return c;
  }
  return target;
}

/** Secondary text colour: `text` softened towards the first background while staying >= `min` on all of them. */
export function deriveMuted(text: string, backgrounds: readonly string[], min = MIN_CONTRAST): string {
  const [first] = backgrounds;
  if (!first) return text;
  for (const t of [0.25, 0.15, 0.08]) {
    const c = mixHex(text, first, t);
    if (backgrounds.every((bg) => contrastRatio(c, bg) >= min)) return c;
  }
  return text;
}
