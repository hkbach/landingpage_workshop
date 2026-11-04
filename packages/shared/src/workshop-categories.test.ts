import { describe, expect, it } from "vitest";
import { FAVORITE_CATEGORY_COUNT, isFavoriteCategories, isWorkshopCategory, toggleCategory, WORKSHOP_CATEGORIES } from "./workshop-categories";

describe("workshop categories", () => {
  it("are different from each other, in capitals with underscores, and include Other", () => {
    expect(new Set(WORKSHOP_CATEGORIES).size).toBe(WORKSHOP_CATEGORIES.length);
    for (const c of WORKSHOP_CATEGORIES) expect(c).toMatch(/^[A-Z]+(_[A-Z]+)*$/);
    expect(WORKSHOP_CATEGORIES).toContain("OTHER");
    expect(WORKSHOP_CATEGORIES.length).toBeGreaterThanOrEqual(FAVORITE_CATEGORY_COUNT);
  });
  it("tells a valid category from anything else", () => {
    expect(isWorkshopCategory("COOKING")).toBe(true);
    for (const v of ["cooking", "", "NOPE", 1, null, undefined, {}]) expect(isWorkshopCategory(v), String(v)).toBe(false);
  });
  it("a guest's favorites are exactly three different valid categories", () => {
    expect(isFavoriteCategories(["COOKING", "BAKING", "ART"])).toBe(true);
    expect(isFavoriteCategories(["COOKING", "BAKING"])).toBe(false);
    expect(isFavoriteCategories(["COOKING", "BAKING", "ART", "FLORAL"])).toBe(false);
    expect(isFavoriteCategories(["COOKING", "COOKING", "ART"])).toBe(false);
    expect(isFavoriteCategories(["COOKING", "BAKING", "NOPE"])).toBe(false);
    expect(isFavoriteCategories("COOKING")).toBe(false);
    expect(isFavoriteCategories(undefined)).toBe(false);
  });
  it("toggling adds, removes, and stops at three", () => {
    expect(toggleCategory([], "ART")).toEqual(["ART"]);
    expect(toggleCategory(["ART"], "ART")).toEqual([]);
    expect(toggleCategory(["ART", "COOKING"], "BAKING")).toEqual(["ART", "COOKING", "BAKING"]);
    expect(toggleCategory(["ART", "COOKING", "BAKING"], "FLORAL")).toEqual(["ART", "COOKING", "BAKING"]); // the fourth is not taken
    expect(toggleCategory(["ART", "COOKING", "BAKING"], "COOKING")).toEqual(["ART", "BAKING"]); // but one can be taken out to make room
  });
});
