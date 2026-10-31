import { describe, expect, it } from "vitest";
import { LOCALES } from "./enums";
import { hreflangOf, isLocale, LOCALE_NATIVE_NAMES, resolveShopLocale, shortLocaleLabel } from "./locales";

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

describe("resolveShopLocale", () => {
  const enabled = ["en", "vi", "zh"] as const;
  it("returns the preferred language when the shop has enabled it", () => {
    expect(resolveShopLocale("vi", enabled, "en")).toBe("vi");
    expect(resolveShopLocale("zh", enabled, "en")).toBe("zh");
  });
  it("falls back to the default language when the preferred one is not enabled", () => {
    expect(resolveShopLocale("ja", enabled, "en")).toBe("en");
    expect(resolveShopLocale("ko", enabled, "vi")).toBe("vi");
  });
  it("falls back to the default for unknown, legacy or missing values", () => {
    expect(resolveShopLocale("zh-TW", enabled, "en")).toBe("en");
    expect(resolveShopLocale("xx", enabled, "en")).toBe("en");
    expect(resolveShopLocale("", enabled, "en")).toBe("en");
    expect(resolveShopLocale(null, enabled, "en")).toBe("en");
    expect(resolveShopLocale(undefined, enabled, "vi")).toBe("vi");
  });
  it("a shop with a single language always gets that language", () => {
    for (const l of ["en", "vi", "ko", "ja", "zh", "fr", null]) expect(resolveShopLocale(l, ["ko"], "ko")).toBe("ko");
  });
});
