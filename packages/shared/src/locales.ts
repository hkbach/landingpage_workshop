import type { Locale } from "./enums";

/** Native names shown in language switchers. */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  en: "English",
  vi: "Tiếng Việt",
  ko: "한국어",
  ja: "日本語",
  zh: "简体中文",
  "zh-TW": "繁體中文",
};

/** BCP 47 tag for the `hreflang` attribute. Bare "zh" is ambiguous, so state the script. */
const HREFLANG: Record<Locale, string> = {
  en: "en",
  vi: "vi",
  ko: "ko",
  ja: "ja",
  zh: "zh-Hans",
  "zh-TW": "zh-Hant",
};

export function hreflangOf(locale: Locale): string {
  return HREFLANG[locale];
}

export function isLocale(value: string | undefined | null): value is Locale {
  return value === "en" || value === "vi" || value === "ko" || value === "ja" || value === "zh" || value === "zh-TW";
}

/** Short label for compact language chips; Chinese scripts use one character so "ZH" is never ambiguous. */
export function shortLocaleLabel(locale: Locale): string {
  if (locale === "zh") return "简";
  if (locale === "zh-TW") return "繁";
  return locale.toUpperCase();
}
