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

/** Earlier versions had a separate Traditional Chinese locale under the key "zh-TW". */
export const LEGACY_CHINESE_KEY = "zh-TW";

const isEmptyValue = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * There is now one Chinese language ("zh"). Walks any JSON value and folds text stored under the old "zh-TW" key into
 * "zh" (an existing non-empty "zh" wins), so nothing the shop already wrote is lost. Idempotent; never mutates the input.
 */
export function mergeLegacyChineseKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => mergeLegacyChineseKeys(v)) as T;
  if (value && typeof value === "object") {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(src)) {
      if (k !== LEGACY_CHINESE_KEY) out[k] = mergeLegacyChineseKeys(v);
    }
    if (LEGACY_CHINESE_KEY in src) {
      const legacy = mergeLegacyChineseKeys(src[LEGACY_CHINESE_KEY]);
      if (isEmptyValue(out.zh) && !isEmptyValue(legacy)) out.zh = legacy;
    }
    return out as T;
  }
  return value;
}
