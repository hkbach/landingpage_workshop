import { describe, expect, it } from "vitest";
import { deepestDiscount, filterPromotions, OVER_BUDGET_PERCENT, overBudgetWorkshops, type PromotionFilter } from "./promotion-insights";
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
  it("combines the promotions that can be combined: fixed first, then each percentage on what is left", () => {
    const d = deepestDiscount(650_000, [p({ id: "x", discountValue: 50 }), p({ id: "y", discountType: "FIXED_AMOUNT", discountValue: 50_000 })]);
    // 650,000 - 50,000 = 600,000; 50% of that = 300,000: 350,000 off in all
    expect(d.amount).toBe(350_000);
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
    expect(overBudgetWorkshops(cand(), [p({ id: "o", discountValue: 50 })], workshops)).toEqual([]);
  });
  it("warns at exactly 80% or more, for the workshops involved (50% then 60% of the rest = 80%)", () => {
    const r = overBudgetWorkshops(cand(), [p({ id: "o", discountValue: 60 })], workshops);
    expect(r.map((x) => x.workshopId)).toEqual(["ws-1", "ws-2"]);
    expect(r[0]).toMatchObject({ percent: 80 });
    expect(r[0]!.promotionIds.sort()).toEqual(["new", "o"]);
  });
  it("warns for a single promotion that is already 80% or more", () => {
    expect(overBudgetWorkshops(cand({ discountValue: 85 }), [], workshops)).toMatchObject([{ workshopId: "ws-1", percent: 85 }, { workshopId: "ws-2", percent: 85 }]);
    expect(overBudgetWorkshops(cand({ discountValue: 79 }), [], workshops)).toEqual([]);
  });
  it("counts a fixed amount as a share of each workshop's price", () => {
    // 300,000 off a 400,000 workshop is 75%; with 20% more of the rest it passes 80%
    const r = overBudgetWorkshops(cand({ discountType: "FIXED_AMOUNT", discountValue: 300_000 }), [p({ id: "o", discountValue: 20 })], workshops);
    expect(r.map((x) => x.workshopId)).toEqual(["ws-2"]); // 300k + 20% of the other 100k = 320k = 80% of 400k; the same two promotions take only 49% off 650k
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
    expect(overBudgetWorkshops(cand({ discountValue: 40, startDate: "2026-11-01", endDate: "2026-11-30" }), [week1, week3], workshops)).toEqual([]); // 40% then 60% = 76% on any one day, never both weeks
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
