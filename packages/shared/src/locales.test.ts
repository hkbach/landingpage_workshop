import { describe, expect, it } from "vitest";
import { LOCALES } from "./enums";
import { hreflangOf, isLocale, LOCALE_NATIVE_NAMES, shortLocaleLabel } from "./locales";

describe("locales", () => {
  it("supports en, vi, ko, ja and a single Chinese language", () => {
    expect([...LOCALES]).toEqual(["en", "vi", "ko", "ja", "zh"]);
  });
  it("has a native name and a distinct hreflang for every locale", () => {
    const tags = LOCALES.map(hreflangOf);
    expect(new Set(tags).size).toBe(LOCALES.length);
    for (const l of LOCALES) expect(LOCALE_NATIVE_NAMES[l].length).toBeGreaterThan(0);
  });
  it("Chinese uses the plain zh tag (the shop chooses the script)", () => {
    expect(hreflangOf("zh")).toBe("zh");
    expect(LOCALE_NATIVE_NAMES.zh).toBe("中文");
  });
  it("isLocale accepts exact codes only and no longer knows zh-TW", () => {
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("zh-TW")).toBe(false);
    expect(isLocale("zh-tw")).toBe(false);
    expect(isLocale("zh-CN")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
  it("short chip labels: codes for most, one character for Chinese", () => {
    expect(shortLocaleLabel("en")).toBe("EN");
    expect(shortLocaleLabel("zh")).toBe("中");
  });
});
