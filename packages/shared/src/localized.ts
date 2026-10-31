import { DEFAULT_LOCALE, type Locale } from "./enums";

export type Localized = Partial<Record<Locale, string>>;

/** Pick text for `locale`; fall back to the shop default locale, then to any non-empty value. */
export function pickLocalized(
  value: Localized | undefined,
  locale: Locale,
  shopDefault: Locale = DEFAULT_LOCALE,
): string {
  if (!value) return "";
  return value[locale]?.trim() || value[shopDefault]?.trim() || Object.values(value).find((v) => v?.trim()) || "";
}

export function missingLocales(value: Localized | undefined, enabled: readonly Locale[]): Locale[] {
  return enabled.filter((l) => !value?.[l]?.trim());
}
