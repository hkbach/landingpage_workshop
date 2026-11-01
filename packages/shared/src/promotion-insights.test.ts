import { describe, expect, it } from "vitest";
import { deepestDiscount, filterPromotions, FULL_DISCOUNT_PERCENT, fullDiscountWorkshops, OVER_BUDGET_PERCENT, overBudgetWorkshops, workshopPromotions, type PromotionFilter } from "./promotion-insights";
import type { PromotionRecord } from "./promotions";

const TODAY = "2026-11-10";
type P = Pick<PromotionRecord, "id" | "title" | "enabled" | "startDate" | "endDate" | "appliesTo" | "workshopIds" | "discountType" | "discountValue" | "stacking">;
const p = (over: Partial<P> & { id: string }): P => ({
  title: { en: "Promo" }, enabled: true, startDate: "2026-11-01", endDate: "2026-11-30", appliesTo: "ALL", workshopIds: [],
  discountType: "PERCENT", discountValue: 10, stacking: "MULTIPLE", ...over,
});
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("filterPromotions", () => {
  const list = [
    p({ id: "a", title: { en: "Early bird", vi: "Đặt sớm" }, startDate: "2026-11-01", endDate: "2026-11-30" }),
    p({ id: "b", title: { en: "Mug sale" }, appliesTo: "SELECTED", workshopIds: ["ws-2"], startDate: "2026-12-01", endDate: "2026-12-31" }),
    p({ id: "c", title: { en: "Old news" }, startDate: "2026-09-01", endDate: "2026-09-30" }),
    p({ id: "d", title: { en: "Paused one" }, enabled: false }),
  ];
  const run = (f: PromotionFilter) => ids(filterPromotions(list, f, TODAY));

  it("returns everything without a filter, and does not change the list", () => {
    expect(run({})).toEqual(["a", "b", "c", "d"]);
    expect(run({ q: "   " })).toEqual(["a", "b", "c", "d"]);
  });
  it("searches the title in any language, ignoring case and accents", () => {
    expect(run({ q: "EARLY" })).toEqual(["a"]);
    expect(run({ q: "dat som" })).toEqual(["a"]);
    expect(run({ q: "Đặt" })).toEqual(["a"]);
    expect(run({ q: "mug" })).toEqual(["b"]);
    expect(run({ q: "nothing like this" })).toEqual([]);
  });
  it("filters by status", () => {
    expect(run({ status: "ACTIVE" })).toEqual(["a"]);
    expect(run({ status: "SCHEDULED" })).toEqual(["b"]);
    expect(run({ status: "EXPIRED" })).toEqual(["c"]);
    expect(run({ status: "PAUSED" })).toEqual(["d"]);
  });
  it("filters by the workshop a promotion applies to (all-workshop promotions apply to every one)", () => {
    expect(run({ workshopId: "ws-1" })).toEqual(["a", "c", "d"]);
    expect(run({ workshopId: "ws-2" })).toEqual(["a", "b", "c", "d"]);
  });
  it("filters by period: promotions that overlap the range, with either end open", () => {
    expect(run({ from: "2026-11-15", to: "2026-11-20" })).toEqual(["a", "d"]);
    expect(run({ from: "2026-11-30", to: "2026-12-01" })).toEqual(["a", "b", "d"]);
    expect(run({ from: "2026-12-15" })).toEqual(["b"]);
    expect(run({ to: "2026-09-15" })).toEqual(["c"]);
    expect(run({ from: "2026-10-01", to: "2026-10-31" })).toEqual([]);
  });
  it("reads a range typed backwards as the days between", () => {
    expect(run({ from: "2026-11-20", to: "2026-11-15" })).toEqual(["a", "d"]);
  });
  it("combines all the filters", () => {
    expect(run({ q: "promo", status: "ACTIVE" })).toEqual([]);
    expect(run({ q: "mug", status: "SCHEDULED", workshopId: "ws-2", from: "2026-12-10" })).toEqual(["b"]);
    expect(run({ q: "mug", workshopId: "ws-1" })).toEqual([]);
  });
});

describe("deepestDiscount", () => {
  it("is nothing without promotions", () => {
    expect(deepestDiscount(650_000, [])).toEqual({ amount: 0, percent: 0, promotionIds: [] });
  });
  it("combines the promotions that can be combined: percentages on the original price, plus fixed amounts", () => {
    const d = deepestDiscount(650_000, [p({ id: "x", discountValue: 50 }), p({ id: "y", discountType: "FIXED_AMOUNT", discountValue: 50_000 })]);
    // 50% of 650,000 = 325,000, plus 50,000: 375,000 off in all
    expect(d.amount).toBe(375_000);
    expect(d.promotionIds.sort()).toEqual(["x", "y"]);
  });
  it("takes a promotion that must be used alone when it beats the combinable ones", () => {
    const d = deepestDiscount(650_000, [p({ id: "a", discountValue: 10 }), p({ id: "b", discountValue: 10 }), p({ id: "big", discountValue: 60, stacking: "SINGLE" })]);
    expect(d.promotionIds).toEqual(["big"]);
    expect(d.percent).toBeCloseTo(60);
  });
  it("never adds a promotion that must be used alone to another one", () => {
    const d = deepestDiscount(1000, [p({ id: "s1", discountValue: 40, stacking: "SINGLE" }), p({ id: "s2", discountValue: 40, stacking: "SINGLE" }), p({ id: "m", discountValue: 30 })]);
    expect(d.percent).toBeCloseTo(40);
    expect(d.promotionIds).toHaveLength(1);
  });
  it("cannot go over the price", () => {
    expect(deepestDiscount(50_000, [p({ id: "f", discountType: "FIXED_AMOUNT", discountValue: 90_000 })]).percent).toBe(100);
  });
});

describe("overBudgetWorkshops", () => {
  const workshops = [{ id: "ws-1", priceAmount: 650_000 }, { id: "ws-2", priceAmount: 400_000 }];
  const cand = (over: Partial<P> = {}) => p({ id: "new", discountValue: 50, ...over });

  it("is 80%", () => expect(OVER_BUDGET_PERCENT).toBe(80));
  it("does not warn below the limit", () => {
    expect(overBudgetWorkshops(cand(), [p({ id: "o", discountValue: 20 })], workshops)).toEqual([]);
  });
  it("warns at exactly 80% or more, for the workshops involved (50% + 30% of the original price = 80%)", () => {
    const r = overBudgetWorkshops(cand(), [p({ id: "o", discountValue: 30 })], workshops);
    expect(r.map((x) => x.workshopId)).toEqual(["ws-1", "ws-2"]);
    expect(r[0]).toMatchObject({ percent: 80 });
    expect(r[0]!.promotionIds.sort()).toEqual(["new", "o"]);
  });
  it("warns for a single promotion that is already 80% or more", () => {
    expect(overBudgetWorkshops(cand({ discountValue: 85 }), [], workshops)).toMatchObject([{ workshopId: "ws-1", percent: 85 }, { workshopId: "ws-2", percent: 85 }]);
    expect(overBudgetWorkshops(cand({ discountValue: 79 }), [], workshops)).toEqual([]);
  });
  it("counts a fixed amount as a share of each workshop's price", () => {
    // 300,000 off a 400,000 workshop is 75%; 5% of the original price (20,000) more makes exactly 80%
    const r = overBudgetWorkshops(cand({ discountType: "FIXED_AMOUNT", discountValue: 300_000 }), [p({ id: "o", discountValue: 5 })], workshops);
    expect(r.map((x) => x.workshopId)).toEqual(["ws-2"]); // the same two promotions take only 51% off the 650,000 workshop
  });
  it("only looks at the workshops the new promotion covers", () => {
    const r = overBudgetWorkshops(cand({ appliesTo: "SELECTED", workshopIds: ["ws-2"], discountValue: 85 }), [], workshops);
    expect(r.map((x) => x.workshopId)).toEqual(["ws-2"]);
    expect(overBudgetWorkshops(cand({ appliesTo: "SELECTED", workshopIds: ["ws-2"], discountValue: 85 }), [p({ id: "o", discountValue: 60, appliesTo: "SELECTED", workshopIds: ["ws-1"] })], workshops).map((x) => x.workshopId)).toEqual(["ws-2"]);
  });
  it("ignores promotions that are paused or run on other days", () => {
    expect(overBudgetWorkshops(cand(), [p({ id: "o", discountValue: 60, enabled: false })], workshops)).toEqual([]);
    expect(overBudgetWorkshops(cand({ startDate: "2026-12-01", endDate: "2026-12-10" }), [p({ id: "o", discountValue: 60, startDate: "2026-11-01", endDate: "2026-11-30" })], workshops)).toEqual([]);
  });
  it("looks at each day: promotions that never run together do not add up", () => {
    const week1 = p({ id: "w1", discountValue: 60, startDate: "2026-11-01", endDate: "2026-11-07" });
    const week3 = p({ id: "w3", discountValue: 60, startDate: "2026-11-15", endDate: "2026-11-21" });
    expect(overBudgetWorkshops(cand({ startDate: "2026-11-01", endDate: "2026-11-30" }), [week1, week3], workshops).map((x) => x.workshopId)).toEqual(["ws-1", "ws-2"]); // week 1 and week 3 each reach 80% with the candidate
    expect(overBudgetWorkshops(cand({ discountValue: 15, startDate: "2026-11-01", endDate: "2026-11-30" }), [week1, week3], workshops)).toEqual([]); // 15% + 60% = 75% on any one day; the two 60% weeks never run together (they would make 135%)
  });
  it("does not count the saved version of the promotion being edited", () => {
    const saved = p({ id: "new", discountValue: 80 });
    expect(overBudgetWorkshops(cand({ discountValue: 10 }), [saved], workshops)).toEqual([]);
  });
  it("never warns for a paused promotion, nor for a workshop without a price", () => {
    expect(overBudgetWorkshops(cand({ discountValue: 95, enabled: false }), [], workshops)).toEqual([]);
    expect(overBudgetWorkshops(cand({ discountValue: 95 }), [], [{ id: "free", priceAmount: 0 }])).toEqual([]);
  });
  it("accepts another limit", () => {
    expect(overBudgetWorkshops(cand({ discountValue: 50 }), [], workshops, 50)).toHaveLength(2);
    expect(overBudgetWorkshops(cand({ discountValue: 49 }), [], workshops, 50)).toEqual([]);
  });
});

describe("workshopPromotions", () => {
  const full = (over: Partial<PromotionRecord> & { id: string }): PromotionRecord => ({
    ...p(over), description: {}, code: "CODE", createdAt: "", updatedAt: "", ...over,
  } as PromotionRecord);
  const w1 = { id: "ws-1", priceAmount: 650_000 };
  const list = [
    full({ id: "all", discountValue: 10 }),
    full({ id: "ws2", appliesTo: "SELECTED", workshopIds: ["ws-2"], discountValue: 30 }),
    full({ id: "fix", discountType: "FIXED_AMOUNT", discountValue: 50_000, stacking: "MULTIPLE" }),
    full({ id: "alone", discountValue: 40, stacking: "SINGLE" }),
    full({ id: "later", startDate: "2026-12-01", endDate: "2026-12-31", discountValue: 90 }),
    full({ id: "off", enabled: false, discountValue: 90 }),
    full({ id: "over", startDate: "2026-09-01", endDate: "2026-09-30", discountValue: 90 }),
  ];

  it("lists the promotions that are active today and cover the workshop", () => {
    expect(workshopPromotions(w1, list, TODAY).applicable.map((x) => x.id).sort()).toEqual(["alone", "all", "fix"].sort());
    expect(workshopPromotions({ id: "ws-2", priceAmount: 400_000 }, list, TODAY).applicable.map((x) => x.id)).toContain("ws2");
  });
  it("gives the deepest discount a guest can reach, as an amount and a share, and the price after it", () => {
    // combinable: 10% of 650,000 = 65,000 plus 50,000 = 115,000 (17.7%); the 40% promotion alone takes 260,000 (40%)
    const r = workshopPromotions(w1, list, TODAY);
    expect(r.max.amount).toBe(260_000);
    expect(r.max.percent).toBeCloseTo(40);
    expect(r.max.promotionIds).toEqual(["alone"]);
    expect(r.priceAfter).toBe(390_000);
  });
  it("combines what can be combined when that beats any single promotion", () => {
    const r = workshopPromotions(w1, list.filter((x) => x.id !== "alone"), TODAY);
    expect(r.max.amount).toBe(115_000);
    expect(r.max.percent).toBeCloseTo(17.69, 1);
    expect(r.max.promotionIds.sort()).toEqual(["all", "fix"]);
    expect(r.priceAfter).toBe(535_000);
  });
  it("is nothing when no promotion applies", () => {
    const r = workshopPromotions(w1, [list[1]!], TODAY);
    expect(r).toEqual({ applicable: [], max: { amount: 0, percent: 0, promotionIds: [] }, priceAfter: 650_000 });
  });
  it("never goes above the price", () => {
    const r = workshopPromotions({ id: "ws-1", priceAmount: 40_000 }, [full({ id: "big", discountType: "FIXED_AMOUNT", discountValue: 90_000 })], TODAY);
    expect(r.max.amount).toBe(40_000);
    expect(r.priceAfter).toBe(0);
  });
});

describe("fullDiscountWorkshops", () => {
  const workshops = [{ id: "ws-1", priceAmount: 650_000 }, { id: "ws-2", priceAmount: 400_000 }];
  const cand = (over: Partial<P> = {}) => p({ id: "new", ...over });
  const fixed = (id: string, v: number, over: Partial<P> = {}) => p({ id, discountType: "FIXED_AMOUNT", discountValue: v, ...over });

  it("is 100%", () => expect(FULL_DISCOUNT_PERCENT).toBe(100));
  it("finds a promotion that takes 100% off", () => {
    expect(fullDiscountWorkshops(cand({ discountValue: 100 }), [], workshops).map((x) => [x.workshopId, x.percent])).toEqual([["ws-1", 100], ["ws-2", 100]]);
  });
  it("lets 99% through: that is a warning (over budget), not a block", () => {
    expect(fullDiscountWorkshops(cand({ discountValue: 99 }), [], workshops)).toEqual([]);
    expect(overBudgetWorkshops(cand({ discountValue: 99 }), [], workshops)).toHaveLength(2);
  });
  it("finds a fixed amount that is at least the price, per workshop", () => {
    const r = fullDiscountWorkshops(cand({ discountType: "FIXED_AMOUNT", discountValue: 400_000 }), [], workshops);
    expect(r.map((x) => x.workshopId)).toEqual(["ws-2"]); // free at 400,000; 650,000 still costs 250,000
    expect(fullDiscountWorkshops(cand({ discountType: "FIXED_AMOUNT", discountValue: 399_999 }), [], workshops)).toEqual([]);
    expect(fullDiscountWorkshops(cand({ discountType: "FIXED_AMOUNT", discountValue: 900_000 }), [], workshops)).toHaveLength(2);
  });
  it("finds fixed amounts that together are at least the price (they can be combined)", () => {
    const r = fullDiscountWorkshops(fixed("new", 150_000, { stacking: "MULTIPLE" }), [fixed("o", 250_000, { stacking: "MULTIPLE" })], workshops);
    expect(r.map((x) => x.workshopId)).toEqual(["ws-2"]);
    expect(r[0]!.promotionIds.sort()).toEqual(["new", "o"]);
  });
  it("does not add fixed amounts that must be used alone", () => {
    expect(fullDiscountWorkshops(fixed("new", 150_000, { stacking: "SINGLE" }), [fixed("o", 250_000, { stacking: "MULTIPLE" })], workshops)).toEqual([]);
  });
  it("shows 99.9%, not 100%, for a discount that is one unit short of the whole price", () => {
    const r = overBudgetWorkshops(fixed("new", 399_999), [], [{ id: "ws-2", priceAmount: 400_000 }]);
    expect(r).toMatchObject([{ workshopId: "ws-2", percent: 99.9 }]);
    expect(fullDiscountWorkshops(fixed("new", 400_000), [], [{ id: "ws-2", priceAmount: 400_000 }])).toMatchObject([{ percent: 100 }]);
  });
  it("finds percentages that add up to 100% of the original price: 60% + 40% is free, 60% + 39% is not", () => {
    expect(fullDiscountWorkshops(cand({ discountValue: 60 }), [p({ id: "o", discountValue: 40 })], workshops)).toHaveLength(2);
    expect(fullDiscountWorkshops(cand({ discountValue: 60 }), [p({ id: "o", discountValue: 39 })], workshops)).toEqual([]);
    expect(fullDiscountWorkshops(cand({ discountValue: 90 }), [p({ id: "a", discountValue: 90 }), p({ id: "b", discountValue: 90 })], workshops)).toHaveLength(2);
  });
  it("does not add percentages of promotions that must be used alone", () => {
    expect(fullDiscountWorkshops(cand({ discountValue: 60, stacking: "SINGLE" }), [p({ id: "o", discountValue: 60, stacking: "SINGLE" })], workshops)).toEqual([]);
    expect(fullDiscountWorkshops(cand({ discountValue: 60, stacking: "SINGLE" }), [p({ id: "o", discountValue: 60 })], workshops)).toEqual([]);
  });
  it("a fixed amount and a percentage together can cover the price", () => {
    expect(fullDiscountWorkshops(cand({ discountValue: 99 }), [fixed("o", 399_000, { stacking: "MULTIPLE" })], workshops).map((x) => x.workshopId)).toEqual(["ws-1", "ws-2"]);
    expect(fullDiscountWorkshops(cand({ discountValue: 50 }), [fixed("o", 100_000, { stacking: "MULTIPLE" })], workshops)).toEqual([]);
  });
  it("only counts promotions that are enabled and run on the same days", () => {
    expect(fullDiscountWorkshops(cand({ discountValue: 60 }), [p({ id: "o", discountValue: 100, enabled: false })], workshops)).toEqual([]);
    expect(fullDiscountWorkshops(cand({ discountValue: 100, startDate: "2027-01-01", endDate: "2027-01-10" }), [], workshops)).toHaveLength(2);
    expect(fullDiscountWorkshops(cand({ discountValue: 50, startDate: "2027-01-01", endDate: "2027-01-10" }), [p({ id: "o", discountValue: 100, startDate: "2026-11-01", endDate: "2026-11-30" })], workshops)).toEqual([]);
  });
  it("a promotion that is paused is never blocked, and the saved version of the one being edited is ignored", () => {
    expect(fullDiscountWorkshops(cand({ discountValue: 100, enabled: false }), [], workshops)).toEqual([]);
    expect(fullDiscountWorkshops(cand({ discountValue: 10 }), [p({ id: "new", discountValue: 100 })], workshops)).toEqual([]);
  });
  it("only blocks for the workshops the promotion covers", () => {
    expect(fullDiscountWorkshops(cand({ appliesTo: "SELECTED", workshopIds: ["ws-1"], discountType: "FIXED_AMOUNT", discountValue: 400_000 }), [], workshops)).toEqual([]);
  });
});
