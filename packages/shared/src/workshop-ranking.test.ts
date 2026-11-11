import { describe, expect, it } from "vitest";
import { isWorkshopCategories, toggleCategory, WORKSHOP_CATEGORY_MAX, type WorkshopCategory } from "./workshop-categories";
import { rankWorkshops, relevance, type RankItem } from "./workshop-ranking";

const w = (id: string, shopId: string, ...categories: WorkshopCategory[]): RankItem => ({ id, shopId, categories });

// Three shops: A has 4 workshops, B has 2, C has 3.
const ITEMS: RankItem[] = [
  w("a1", "A", "COOKING"), w("a2", "A", "COOKING", "BAKING"), w("a3", "A", "ART"), w("a4", "A", "COOKING"),
  w("b1", "B", "COOKING"), w("b2", "B", "POTTERY"),
  w("c1", "C", "COOKING", "DRINKS"), w("c2", "C", "COOKING"), w("c3", "C", "WELLNESS"),
];
const shopsOf = (list: RankItem[]) => list.map((i) => i.shopId).join("");

describe("the categories of a workshop", () => {
  it("1 to 3 different valid ones", () => {
    expect(isWorkshopCategories(["COOKING"])).toBe(true);
    expect(isWorkshopCategories(["COOKING", "ART", "OTHER"])).toBe(true);
    for (const bad of [[], ["COOKING", "ART", "OTHER", "BAKING"], ["COOKING", "COOKING"], ["NOPE"], "COOKING", null]) expect(isWorkshopCategories(bad), JSON.stringify(bad)).toBe(false);
  });
  it("a workshop can be given up to 3 and a guest 3 as well", () => {
    expect(WORKSHOP_CATEGORY_MAX).toBe(3);
    expect(toggleCategory(["COOKING", "ART", "OTHER"], "BAKING")).toEqual(["COOKING", "ART", "OTHER"]); // full: nothing is added
    expect(toggleCategory(["COOKING", "ART"], "ART")).toEqual(["COOKING"]);
    expect(toggleCategory(["COOKING"], "ART", 1)).toEqual(["COOKING"]); // a smaller limit
  });
});

describe("rankWorkshops", () => {
  it("gives back every workshop once, and the same order for the same input", () => {
    const a = rankWorkshops(ITEMS, ["COOKING", "DRINKS"], 7);
    expect([...a.map((i) => i.id)].sort()).toEqual(ITEMS.map((i) => i.id).sort());
    expect(rankWorkshops(ITEMS, ["COOKING", "DRINKS"], 7)).toEqual(a);
    expect(ITEMS[0]!.id).toBe("a1"); // the list given is not changed
  });
  it("shows first what shares the most categories with what the guest likes", () => {
    const fav: WorkshopCategory[] = ["COOKING", "DRINKS", "WELLNESS"];
    const out = rankWorkshops(ITEMS, fav, 3);
    const scores = out.map((i) => relevance(i.categories, fav));
    expect(scores).toEqual([...scores].sort((x, y) => y - x));
    expect(out[0]!.id).toBe("c1"); // COOKING + DRINKS: the only one that shares 2
    expect(out.at(-1)!.categories.some((c) => fav.includes(c))).toBe(false); // what shares nothing is last
  });
  it("in a group the shops take turns, so a shop with more workshops does not get ahead", () => {
    // Everything shares exactly one category with COOKING-only favorites, or none: look at the group that shares one.
    const out = rankWorkshops(ITEMS, ["COOKING"], 0).filter((i) => relevance(i.categories, ["COOKING"]) === 1);
    const byShop = new Map<string, number>();
    const order: string[] = [];
    for (const i of out) { byShop.set(i.shopId, (byShop.get(i.shopId) ?? 0) + 1); order.push(i.shopId); }
    // the first 3 places go to 3 different shops (each has at least one), and no shop has 2 places before every other shop has 1
    expect(new Set(order.slice(0, 3)).size).toBe(3);
    const seen = new Set<string>();
    for (const s of order) { if (seen.has(s)) expect(seen.size).toBe(3); seen.add(s); }
  });
  it("which shop leads rotates with the seed: over a few seeds every shop leads, whatever the date it was created", () => {
    const leaders = new Set<string>();
    for (let seed = 0; seed < 3; seed++) leaders.add(rankWorkshops(ITEMS, ["COOKING"], seed)[0]!.shopId);
    expect(leaders).toEqual(new Set(["A", "B", "C"]));
    // and each shop leads equally often over 3 consecutive seeds, whatever its size
    const count = (shop: string) => [0, 1, 2].filter((seed) => rankWorkshops(ITEMS, [], seed)[0]!.shopId === shop).length;
    expect([count("A"), count("B"), count("C")]).toEqual([1, 1, 1]);
  });
  it("the workshop a shop puts first rotates too, and the whole order changes from a seed to the next", () => {
    const firstOfA = (seed: number) => rankWorkshops(ITEMS, [], seed).find((i) => i.shopId === "A")!.id;
    expect(new Set([0, 1, 2, 3].map(firstOfA)).size).toBeGreaterThan(1);
    expect(shopsOf(rankWorkshops(ITEMS, [], 0))).not.toBe(shopsOf(rankWorkshops(ITEMS, [], 1)));
  });
  it("without favorites every workshop is in one group that is shared fairly; with no workshop it is empty", () => {
    expect(shopsOf(rankWorkshops(ITEMS, [], 0)).slice(0, 3).split("").sort().join("")).toBe("ABC");
    expect(rankWorkshops([], ["COOKING"], 5)).toEqual([]);
    expect(rankWorkshops(ITEMS, [], -4)).toHaveLength(ITEMS.length); // a negative seed is fine
  });
  it("another guest (another seed) sees another leader", () => {
    const leaders = new Set([11, 12, 13, 14, 15].map((seed) => rankWorkshops(ITEMS, ["COOKING"], seed)[0]!.shopId));
    expect(leaders.size).toBe(3);
  });
});
