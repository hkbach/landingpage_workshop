/** ISO 4217 minor-unit digits for supported currencies (BR-14). */
const MINOR_DIGITS: Record<string, number> = { VND: 0, JPY: 0, KRW: 0, USD: 2, EUR: 2, SGD: 2, THB: 2 };

export function minorDigits(currency: string): number {
  return MINOR_DIGITS[currency] ?? 2;
}

/** Format bigint-like minor units for display. Amounts arrive as number|string from the API. */
export function formatMoney(amountMinor: number | string | bigint, currency: string, locale = "en"): string {
  const digits = minorDigits(currency);
  const major = Number(amountMinor) / 10 ** digits;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(major);
}

/**
 * An amount typed by a person to minor units, or null when it is not an amount. A currency without decimals (VND, JPY, KRW) takes whole numbers, whatever separators a person
 * writes between the thousands ("1,500,000", "1.500.000", "1 500 000"); a currency with decimals takes a number with at most that many decimals ("12", "12.5", "12,50").
 */
export function parseMoney(text: string, currency: string): number | null {
  const digits = minorDigits(currency);
  const s = text.trim();
  if (digits === 0) {
    // Only real thousands groups: "1.500.000" is 1500000, but "12.5" or "1500.7" is not a whole amount (a decimal typed by mistake must not become 125 or 15007).
    if (!/^\d+$/.test(s) && !/^\d{1,3}(?:([\s,.])\d{3})(?:\1\d{3})*$/.test(s)) return null;
    const whole = s.replace(/[\s,.]/g, "");
    return /^\d{1,15}$/.test(whole) ? Number(whole) : null;
  }
  const m = /^(\d{1,12})(?:[.,](\d{1,6}))?$/.exec(s.replace(/\s/g, ""));
  if (!m || (m[2] ?? "").length > digits) return null; // more decimals than the currency has
  return Number(m[1]) * 10 ** digits + Number((m[2] ?? "").padEnd(digits, "0") || 0);
}
