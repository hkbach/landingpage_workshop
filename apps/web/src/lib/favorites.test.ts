import { describe, expect, it } from "vitest";
import { normalizeGuestEmail, parseFavorites, toggleFavorite } from "./favorites";

describe("parseFavorites", () => {
  it("reads the list of ids that was stored", () => {
    expect(parseFavorites('["w-1","w-2"]')).toEqual(["w-1", "w-2"]);
  });
  it("gives an empty list for nothing, for damaged text and for anything that is not a list", () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites("")).toEqual([]);
    expect(parseFavorites("{not json")).toEqual([]);
    expect(parseFavorites('{"a":1}')).toEqual([]);
    expect(parseFavorites('"w-1"')).toEqual([]);
  });
  it("keeps only text ids, each once", () => {
    expect(parseFavorites('["w-1",2,null,"","w-1","w-3"]')).toEqual(["w-1", "w-3"]);
  });
});

describe("toggleFavorite", () => {
  it("adds a workshop that is not saved yet", () => {
    expect(toggleFavorite(["w-1"], "w-2")).toEqual(["w-1", "w-2"]);
  });
  it("takes out a workshop that is saved", () => {
    expect(toggleFavorite(["w-1", "w-2"], "w-1")).toEqual(["w-2"]);
  });
  it("does not change the list it was given", () => {
    const ids = ["w-1"];
    toggleFavorite(ids, "w-2");
    expect(ids).toEqual(["w-1"]);
  });
});

describe("normalizeGuestEmail", () => {
  it("trims and lower-cases, so the same person is the same guest", () => {
    expect(normalizeGuestEmail("  Binh.Tran@Example.COM ")).toBe("binh.tran@example.com");
  });
});
