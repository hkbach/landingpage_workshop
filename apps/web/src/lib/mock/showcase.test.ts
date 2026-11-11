import { describe, expect, it } from "vitest";
import { featuredWorkshops, pickRandom, showcaseCandidates } from "./showcase";

describe("pickRandom", () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  it("takes the number asked, without repeating an item and keeping the list as it was", () => {
    const copy = [...items];
    const picked = pickRandom(items, 10);
    expect(picked).toHaveLength(10);
    expect(new Set(picked).size).toBe(10);
    expect(items).toEqual(copy);
  });
  it("gives everything when there are fewer than asked, and nothing for zero or less", () => {
    expect(pickRandom([1, 2, 3], 10)).toHaveLength(3);
    expect(pickRandom(items, 0)).toEqual([]);
    expect(pickRandom(items, -2)).toEqual([]);
  });
  it("depends on the random number: the same numbers give the same pick, other numbers another", () => {
    const seq = (values: number[]) => { let i = 0; return () => values[i++ % values.length]!; };
    expect(pickRandom(items, 5, seq([0.1, 0.5, 0.9]))).toEqual(pickRandom(items, 5, seq([0.1, 0.5, 0.9])));
    expect(pickRandom(items, 5, seq([0.1, 0.5, 0.9]))).not.toEqual(pickRandom(items, 5, seq([0.7, 0.2, 0.4])));
  });
  it("gives every item a chance: over many picks each of 4 items is first about a quarter of the time", () => {
    const first = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) first[pickRandom([0, 1, 2, 3], 1)[0]!]!++;
    for (const n of first) expect(n).toBeGreaterThan(800);
  });
});

describe("the workshops of the public site", () => {
  it("come from several shops, all ACTIVE, with a picture and a title in the language asked (or the language of the shop)", () => {
    const all = showcaseCandidates("vi");
    expect(new Set(all.map((w) => w.shopSlug)).size).toBeGreaterThanOrEqual(3);
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(all.every((w) => w.title.length > 0 && w.coverUrl.length > 0)).toBe(true);
    expect(all.some((w) => w.title === "Pour-over chuyên sâu")).toBe(true);
    expect(showcaseCandidates("en").some((w) => w.title === "Pour-Over Masterclass")).toBe(true);
  });
  it("never include a draft workshop (Coffee Roasting Day, Dessert Without Dairy)", () => {
    const titles = showcaseCandidates("en").map((w) => w.title);
    expect(titles).not.toContain("Coffee Roasting Day");
    expect(titles).not.toContain("Dessert Without Dairy");
  });
  it("are 10 at most, a different pick each time", () => {
    const a = featuredWorkshops("en", 10).map((w) => w.id).join();
    expect(featuredWorkshops("en", 10)).toHaveLength(10);
    let different = false;
    for (let i = 0; i < 20 && !different; i++) different = featuredWorkshops("en", 10).map((w) => w.id).join() !== a;
    expect(different).toBe(true);
  });
});
