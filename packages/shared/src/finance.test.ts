import { describe, expect, it } from "vitest";
import {
  byCategory, dateToOccurredAt, entriesFromPayments, filterEntries, financeEntrySchema, isRealDate, lastMonthKeys, monthKey, monthlySeries,
  niceScale, summarize, type FinanceEntry,
} from "./finance";

const TZ = "Asia/Ho_Chi_Minh";
const e = (id: string, type: "INCOME" | "EXPENSE", category: FinanceEntry["category"], amount: number, occurredAt: string): FinanceEntry =>
  ({ id, type, category, amount, currency: "VND", occurredAt, source: "MANUAL" });

describe("financeEntrySchema", () => {
  const ok = { type: "EXPENSE", category: "RENT", amount: 5_000_000, date: "2026-10-05", note: "October" };
  it("accepts a valid manual entry", () => expect(financeEntrySchema.safeParse(ok).success).toBe(true));
  const code = (v: unknown) => financeEntrySchema.safeParse(v).error?.issues.map((i) => i.message);
  it("needs a positive whole amount", () => {
    expect(code({ ...ok, amount: 0 })).toContain("amountInvalid");
    expect(code({ ...ok, amount: -5 })).toContain("amountInvalid");
    expect(code({ ...ok, amount: 1.5 })).toContain("amountInvalid");
    expect(code({ ...ok, amount: 2e12 })).toContain("amountTooLarge");
  });
  it("needs a real calendar date", () => {
    expect(code({ ...ok, date: "2026-02-30" })).toContain("dateInvalid");
    expect(code({ ...ok, date: "05/10/2026" })).toContain("dateInvalid");
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2027-02-29")).toBe(false);
  });
  it("only allows categories that fit the type, and never the derived ones", () => {
    expect(code({ ...ok, category: "SALES" })).toContain("categoryMismatch");
    expect(code({ ...ok, type: "INCOME", category: "RENT" })).toContain("categoryMismatch");
    expect(code({ ...ok, type: "INCOME", category: "BOOKINGS" })).toContain("categoryMismatch");
    expect(code({ ...ok, category: "REFUNDS" })).toContain("categoryMismatch");
    expect(financeEntrySchema.safeParse({ ...ok, type: "INCOME", category: "SALES" }).success).toBe(true);
  });
  it("limits the note to 200 characters and trims it", () => {
    expect(code({ ...ok, note: "x".repeat(201) })).toContain("noteTooLong");
    expect(financeEntrySchema.parse({ ...ok, note: "  hi  " }).note).toBe("hi");
  });
});

describe("dates and months", () => {
  it("a business date keeps its calendar day in the shop timezone", () => {
    expect(monthKey(dateToOccurredAt("2026-10-31"), TZ)).toBe("2026-10");
    expect(monthKey(dateToOccurredAt("2026-11-01"), TZ)).toBe("2026-11");
  });
  it("groups by the shop timezone, not by UTC", () => {
    expect(monthKey("2026-10-31T20:00:00Z", TZ)).toBe("2026-11"); // 03:00 on 1 Nov in Ho Chi Minh
    expect(monthKey("2026-10-31T20:00:00Z", "UTC")).toBe("2026-10");
  });
  it("lists the last months oldest first, across a year change", () => {
    expect(lastMonthKeys(new Date("2026-02-10T00:00:00Z"), TZ, 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(lastMonthKeys(new Date("2026-11-01T00:00:00Z"), TZ, 1)).toEqual(["2026-11"]);
  });
});

describe("reports", () => {
  const entries = [
    e("1", "INCOME", "SALES", 300, "2026-09-10T05:00:00Z"),
    e("2", "EXPENSE", "RENT", 200, "2026-09-12T05:00:00Z"),
    e("3", "EXPENSE", "MATERIALS", 100, "2026-10-02T05:00:00Z"),
    e("4", "EXPENSE", "RENT", 200, "2026-10-12T05:00:00Z"),
    e("5", "INCOME", "OTHER_INCOME", 50, "2026-07-01T05:00:00Z"),
  ];
  it("sums income, expense and the net result", () => {
    expect(summarize(entries)).toEqual({ income: 350, expense: 500, net: -150 });
    expect(summarize([])).toEqual({ income: 0, expense: 0, net: 0 });
  });
  it("has one point for every month, zero where nothing happened", () => {
    const s = monthlySeries(entries, TZ, ["2026-08", "2026-09", "2026-10"]);
    expect(s).toEqual([
      { key: "2026-08", income: 0, expense: 0, net: 0 },
      { key: "2026-09", income: 300, expense: 200, net: 100 },
      { key: "2026-10", income: 0, expense: 300, net: -300 },
    ]);
  });
  it("splits one type by category, biggest first, with shares that add up to 1", () => {
    const c = byCategory(entries, "EXPENSE");
    expect(c.map((x) => [x.category, x.amount])).toEqual([["RENT", 400], ["MATERIALS", 100]]);
    expect(c.reduce((n, x) => n + x.share, 0)).toBeCloseTo(1);
    expect(byCategory(entries, "INCOME").map((x) => x.category)).toEqual(["SALES", "OTHER_INCOME"]);
    expect(byCategory([], "INCOME")).toEqual([]);
  });
  it("filters by months, type and category, newest first", () => {
    const months = ["2026-09", "2026-10"];
    expect(filterEntries(entries, { months }, TZ).map((x) => x.id)).toEqual(["4", "3", "2", "1"]);
    expect(filterEntries(entries, { months, type: "EXPENSE", category: "RENT" }, TZ).map((x) => x.id)).toEqual(["4", "2"]);
    expect(filterEntries(entries, { months: ["2026-07"] }, TZ).map((x) => x.id)).toEqual(["5"]);
  });
});

describe("entriesFromPayments", () => {
  it("turns payments into income from bookings and refunds into expenses", () => {
    const out = entriesFromPayments([{
      id: "bk-1", bookingCode: "7K3M9QX2", currency: "VND",
      payments: [{ id: "p1", type: "PAYMENT", amount: 900, recordedAt: "2026-10-01T03:00:00Z" }, { id: "p2", type: "REFUND", amount: 100, recordedAt: "2026-10-02T03:00:00Z" }],
    }]);
    expect(out.map((x) => [x.type, x.category, x.amount, x.source])).toEqual([["INCOME", "BOOKINGS", 900, "BOOKING"], ["EXPENSE", "REFUNDS", 100, "BOOKING"]]);
    expect(summarize(out).net).toBe(800);
  });
});

describe("niceScale", () => {
  it("uses a round step and whole steps from bottom to top", () => {
    expect(niceScale(55_000_000)).toEqual({ top: 60_000_000, bottom: 0, step: 20_000_000 });
    expect(niceScale(7)).toEqual({ top: 8, bottom: 0, step: 2 });
    expect(niceScale(100)).toEqual({ top: 100, bottom: 0, step: 50 });
  });
  it("makes room for negative values", () => {
    const s = niceScale(60, -35);
    expect(s.bottom).toBeLessThanOrEqual(-35);
    expect(s.top).toBeGreaterThanOrEqual(60);
    expect(Math.abs(s.bottom % s.step)).toBe(0);
    expect(Math.abs(s.top % s.step)).toBe(0);
  });
  it("still gives a usable axis when there is no data", () => {
    expect(niceScale(0)).toEqual({ top: 4, bottom: 0, step: 1 });
    expect(niceScale(0, 0).top).toBeGreaterThan(0);
  });
});
