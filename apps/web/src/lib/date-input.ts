import { isDayKey } from "@workshop/shared";

// How a day is typed and shown in the date boxes, by the language of the page (not by the browser): the order of year, month and day, and the
// separator. The value kept by the page is always "YYYY-MM-DD".
type Order = "MDY" | "DMY" | "YMD";
interface DateFormat { order: Order; sep: string }

const FORMATS: Record<string, DateFormat> = {
  en: { order: "MDY", sep: "/" }, // 11/03/2026
  vi: { order: "DMY", sep: "/" }, // 03/11/2026
  ko: { order: "YMD", sep: ". " }, // 2026. 11. 03.
  ja: { order: "YMD", sep: "/" }, // 2026/11/03
  zh: { order: "YMD", sep: "/" }, // 2026/11/03
};
const formatOf = (locale: string): DateFormat => FORMATS[locale] ?? FORMATS.en!;

/** "YYYY-MM-DD" as typed in the language of the page; an empty or invalid day gives "". */
export function formatDay(day: string, locale: string): string {
  if (!isDayKey(day)) return "";
  const [y, m, d] = day.split("-") as [string, string, string];
  const { order, sep } = formatOf(locale);
  const parts = order === "MDY" ? [m, d, y] : order === "DMY" ? [d, m, y] : [y, m, d];
  return parts.join(sep) + (locale === "ko" ? "." : "");
}

/**
 * What a person typed to "YYYY-MM-DD", or null when it is not a real day. The order follows the language; any separator is accepted ("3/11/2026",
 * "03-11-2026", "03.11.2026"), and so are 8 digits with none ("03112026"). The year needs 4 digits.
 */
export function parseDay(text: string, locale: string): string | null {
  const t = text.trim();
  if (!t) return null;
  const { order } = formatOf(locale);
  let groups = t.split(/\D+/).filter(Boolean);
  if (groups.length === 1 && /^\d{8}$/.test(groups[0]!)) {
    const s = groups[0]!;
    groups = order === "YMD" ? [s.slice(0, 4), s.slice(4, 6), s.slice(6)] : [s.slice(0, 2), s.slice(2, 4), s.slice(4)];
  }
  if (groups.length !== 3 || /\D/.test(t.replace(/[\d\s./\-,]/g, ""))) return null;
  const [a, b, c] = groups as [string, string, string];
  const [y, m, d] = order === "MDY" ? [c, a, b] : order === "DMY" ? [c, b, a] : [a, b, c];
  if (y.length !== 4 || m.length > 2 || d.length > 2) return null;
  const day = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isDayKey(day) ? day : null;
}

/** Whether a day is inside the limits (each one optional, "YYYY-MM-DD"); a day that is not set is never inside. */
export const dayInBounds = (day: string, min?: string, max?: string): boolean => isDayKey(day) && (!min || day >= min) && (!max || day <= max);
