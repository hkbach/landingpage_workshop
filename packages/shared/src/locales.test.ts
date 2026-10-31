import { describe, expect, it } from "vitest";
import { LOCALES } from "./enums";
import { hreflangOf, isLocale, LOCALE_NATIVE_NAMES, shortLocaleLabel } from "./locales";

describe("locales", () => {
  it("supports en, vi, ko, ja and both Chinese scripts", () => {
    expect([...LOCALES]).toEqual(["en", "vi", "ko", "ja", "zh", "zh-TW"]);
  });
  it("has a native name and a distinct hreflang for every locale", () => {
    const tags = LOCALES.map(hreflangOf);
    expect(new Set(tags).size).toBe(LOCALES.length);
    for (const l of LOCALES) expect(LOCALE_NATIVE_NAMES[l].length).toBeGreaterThan(0);
  });
  it("states the script for Chinese hreflang", () => {
    expect(hreflangOf("zh")).toBe("zh-Hans");
    expect(hreflangOf("zh-TW")).toBe("zh-Hant");
  });
  it("isLocale accepts exact codes only", () => {
    expect(isLocale("zh-TW")).toBe(true);
    expect(isLocale("zh")).toBe(true);
    expect(isLocale("zh-tw")).toBe(false);
    expect(isLocale("zh-CN")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
  it("short chip labels: codes for most, one character per Chinese script", () => {
    expect(shortLocaleLabel("en")).toBe("EN");
    expect(shortLocaleLabel("zh")).toBe("简");
    expect(shortLocaleLabel("zh-TW")).toBe("繁");
  });
});
