import { describe, expect, it } from "vitest";
import { missingLocales, pickLocalized } from "./localized";

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
