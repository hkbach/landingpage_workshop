/** Amount typed in major units ("1,500.50" or "1500") to minor units; null when it is not a positive number. */
export function parseAmount(text: string, digits: number): number | null {
  const s = text.trim().replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [, frac = ""] = s.split(".");
  if (frac.length > digits) return null;
  const minor = Math.round(Number(s) * 10 ** digits);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
