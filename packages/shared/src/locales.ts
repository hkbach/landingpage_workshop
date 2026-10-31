import type { Locale } from "./enums";

/** Native names shown in language switchers. Chinese is one language: the shop writes whichever script it prefers. */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  vi: "Tiếng Việt",
  ko: "한국어",
  ja: "日本語",
  zh: "中文",
};

/** BCP 47 tag for the `hreflang` attribute. */
const HREFLANG: Record<Locale, string> = {
  en: "en",
  vi: "vi",
  ko: "ko",
  ja: "ja",
  zh: "zh",
};

export function hreflangOf(locale: Locale): string {
  return HREFLANG[locale];
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "vi" || value === "ko" || value === "ja" || value === "zh";
}

/** Short label for compact language chips. */
export function shortLocaleLabel(locale: Locale): string {
  return locale === "zh" ? "中" : locale.toUpperCase();
}
