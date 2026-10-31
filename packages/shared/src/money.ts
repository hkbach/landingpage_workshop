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
