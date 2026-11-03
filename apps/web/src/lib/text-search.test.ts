import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeSearch } from "./text-search";

describe("normalizeSearch", () => {
  it("trims, lower-cases and squeezes spaces", () => expect(normalizeSearch("  Pottery   WHEEL ")).toBe("pottery wheel"));
  it("drops accents, also Vietnamese ones, and writes đ as d", () => {
    expect(normalizeSearch("Làm gốm cơ bản")).toBe("lam gom co ban");
    expect(normalizeSearch("Đất sét")).toBe("dat set");
    expect(normalizeSearch("Café")).toBe("cafe");
  });
  it("keeps Korean and Chinese text as it is (and Japanese kana without dakuten marks)", () => {
    expect(normalizeSearch("도자기 물레 기초")).toBe("도자기 물레 기초");
    expect(normalizeSearch("ろくろ体験")).toBe("ろくろ体験");
    expect(normalizeSearch("陶艺转盘入门")).toBe("陶艺转盘入门");
  });
});

describe("matchesSearch", () => {
  const text = "Pottery Wheel Basics Làm gốm cơ bản";
  it("an empty search matches everything", () => {
    expect(matchesSearch(text, "")).toBe(true);
    expect(matchesSearch(text, "   ")).toBe(true);
  });
  it("finds a part of the text, whatever the case", () => {
    expect(matchesSearch(text, "wheel")).toBe(true);
    expect(matchesSearch(text, "  BASICS ")).toBe(true);
  });
  it("finds Vietnamese text typed without accents", () => expect(matchesSearch(text, "lam gom")).toBe(true));
  it("does not find what is not there", () => expect(matchesSearch(text, "candle")).toBe(false));
});
