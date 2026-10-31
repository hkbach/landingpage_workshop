import { describe, expect, it } from "vitest";
import { mergeLegacyChineseKeys, missingLocales, pickLocalized } from "./localized";

describe("pickLocalized", () => {
  it("returns the requested locale", () => {
    expect(pickLocalized({ en: "Hello", vi: "Xin chao" }, "vi", "en")).toBe("Xin chao");
  });
  it("falls back to the shop default locale", () => {
    expect(pickLocalized({ en: "Hello" }, "ko", "en")).toBe("Hello");
    expect(pickLocalized({ en: "Hello", vi: "Xin chao" }, "ko", "vi")).toBe("Xin chao");
  });
  it("treats blank text as missing", () => {
    expect(pickLocalized({ en: "Hello", vi: "   " }, "vi", "en")).toBe("Hello");
  });
  it("falls back to any non-empty value, then to an empty string", () => {
    expect(pickLocalized({ ja: "Konnichiwa" }, "ko", "en")).toBe("Konnichiwa");
    expect(pickLocalized({}, "en")).toBe("");
    expect(pickLocalized(undefined, "en")).toBe("");
  });
});

describe("missingLocales", () => {
  it("lists enabled locales without text", () => {
    expect(missingLocales({ en: "a", ko: " " }, ["en", "vi", "ko"])).toEqual(["vi", "ko"]);
  });
});

describe("mergeLegacyChineseKeys", () => {
  it("moves text written under zh-TW into zh", () => {
    expect(mergeLegacyChineseKeys({ en: "Hi", "zh-TW": "你好" })).toEqual({ en: "Hi", zh: "你好" });
  });
  it("keeps an existing zh and drops the old key", () => {
    expect(mergeLegacyChineseKeys({ zh: "简", "zh-TW": "繁" })).toEqual({ zh: "简" });
  });
  it("fills an empty zh from the old key", () => {
    expect(mergeLegacyChineseKeys({ zh: "", "zh-TW": "繁" })).toEqual({ zh: "繁" });
  });
  it("works deep inside props, arrays and lists of strings", () => {
    const props = { heading: { en: "H", "zh-TW": "標題" }, items: [{ q: { "zh-TW": "問" } }], includes: { "zh-TW": ["a", "b"] }, plain: "keep", n: 3 };
    expect(mergeLegacyChineseKeys(props)).toEqual({ heading: { en: "H", zh: "標題" }, items: [{ q: { zh: "問" } }], includes: { zh: ["a", "b"] }, plain: "keep", n: 3 });
  });
  it("is idempotent and leaves data without the old key untouched", () => {
    const clean = { en: "x", zh: "y" };
    expect(mergeLegacyChineseKeys(clean)).toEqual(clean);
    expect(mergeLegacyChineseKeys(mergeLegacyChineseKeys({ "zh-TW": "z" }))).toEqual({ zh: "z" });
  });
  it("does not mutate its input and passes primitives through", () => {
    const input = { "zh-TW": "z" };
    mergeLegacyChineseKeys(input);
    expect(input).toEqual({ "zh-TW": "z" });
    expect(mergeLegacyChineseKeys("text")).toBe("text");
    expect(mergeLegacyChineseKeys(null)).toBeNull();
  });
});
