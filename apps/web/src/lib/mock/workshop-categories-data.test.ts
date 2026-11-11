import { describe, expect, it } from "vitest";
import { isWorkshopCategories, rankWorkshops } from "@workshop/shared";
import { adminWorkshops, workshopsWithShop } from "./admin-directory";

// Every workshop of every shop has 1 to 3 categories, and the shops share some, so the order of the Workshops page (by the favorite categories of a guest, the shops taking turns)
// has something to show.

describe("the categories of the demo workshops", () => {
  const all = workshopsWithShop();
  it("every workshop has 1 to 3 different valid categories", () => {
    expect(all.length).toBeGreaterThanOrEqual(9);
    for (const { workshop } of all) expect(isWorkshopCategories(workshop.categories), workshop.id).toBe(true);
  });
  it("the admin list shows them", () => {
    for (const w of adminWorkshops()) expect(w.categories.length, w.id).toBeGreaterThanOrEqual(1);
  });
  it("different shops have workshops of the same categories, and some workshops have more than one", () => {
    const shopsOf = (c: string) => new Set(all.filter((x) => (x.workshop.categories as string[]).includes(c)).map((x) => x.shop.id));
    expect(shopsOf("COOKING").size).toBeGreaterThanOrEqual(2);
    expect(all.some((x) => x.workshop.categories.length > 1)).toBe(true);
  });
  it("a guest who likes COOKING sees workshops of several shops at the top, and a different shop leads for different guests", () => {
    const items = all.filter((x) => x.workshop.status === "ACTIVE").map((x) => ({ id: x.workshop.id, shopId: x.shop.id, categories: x.workshop.categories }));
    const top = rankWorkshops(items, ["COOKING", "BAKING", "COFFEE_TEA"], 5).slice(0, 4);
    expect(new Set(top.map((i) => i.shopId)).size).toBeGreaterThanOrEqual(2);
    const leaders = new Set([0, 1, 2, 3, 4, 5].map((seed) => rankWorkshops(items, ["COOKING"], seed)[0]!.shopId));
    expect(leaders.size).toBeGreaterThanOrEqual(2);
  });
});
