import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mockFinanceEntries } from "@/lib/mock/data";
import { byCategory, lastMonthKeys, monthlySeries, summarize, type FinanceEntry } from "@workshop/shared";
import { CategoryBars, compactMoney, MonthlyChart } from "./charts";
import { addEntry, FINANCE_KEY, loadManualEntries, parseAmount, parseEntries, removeEntry, saveManualEntries, updateEntry } from "./finance-store";

const input = { type: "EXPENSE" as const, category: "RENT", amount: 5_000_000, date: "2026-10-05", note: "Rent" };
const ctx = { id: "fe-new", currency: "VND" };

describe("manual entries", () => {
  it("adds an entry at noon UTC of its date, with the shop currency", () => {
    const out = addEntry([], input, ctx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "fe-new", type: "EXPENSE", category: "RENT", amount: 5_000_000, currency: "VND", occurredAt: "2026-10-05T12:00:00.000Z", source: "MANUAL", note: "Rent" });
  });
  it("updates only the entry with that id, and never a booking entry", () => {
    const booking: FinanceEntry = { id: "pay-1", type: "INCOME", category: "BOOKINGS", amount: 100, currency: "VND", occurredAt: "2026-10-01T03:00:00Z", source: "BOOKING" };
    const list = [...addEntry([], input, ctx), booking];
    const out = updateEntry(list, "fe-new", { ...input, amount: 6_000_000 }, "VND");
    expect(out[0]?.amount).toBe(6_000_000);
    expect(updateEntry(list, "pay-1", input, "VND")).toEqual(list);
    expect(updateEntry(list, "nope", input, "VND")).toEqual(list);
  });
  it("removes by id", () => {
    expect(removeEntry(addEntry([], input, ctx), "fe-new")).toEqual([]);
  });
});

describe("parseAmount", () => {
  it("reads major units into minor units", () => {
    expect(parseAmount("1500", 0)).toBe(1500);
    expect(parseAmount("1,500,000", 0)).toBe(1_500_000);
    expect(parseAmount("12.50", 2)).toBe(1250);
    expect(parseAmount(" 0.1 ", 2)).toBe(10);
  });
  it("refuses anything that is not a positive amount the currency can hold", () => {
    for (const bad of ["", "abc", "-5", "0", "12.345", "1.5e3", "12.5"]) expect(parseAmount(bad, bad === "12.5" ? 0 : 2), bad).toBeNull();
  });
});

describe("stored entries", () => {
  const good = { id: "a", type: "INCOME", category: "SALES", amount: 10, occurredAt: "2026-10-05T12:00:00.000Z", note: "x" };
  it("keeps valid rows and drops the rest", () => {
    const out = parseEntries(JSON.stringify([good, { ...good }, { ...good, id: "b", category: "RENT" }, { ...good, id: "c", amount: -1 }, { ...good, id: "d", occurredAt: "nope" }, { ...good, id: "e", category: "BOOKINGS" }, 5]), "VND");
    expect(out?.map((e) => e.id)).toEqual(["a"]);
    expect(out?.[0]?.source).toBe("MANUAL");
  });
  it("is null for nothing or corrupt data", () => {
    expect(parseEntries(null, "VND")).toBeNull();
    expect(parseEntries("{", "VND")).toBeNull();
    expect(parseEntries("{}", "VND")).toBeNull();
  });

  const m = new Map<string, string>();
  beforeEach(() => {
    m.clear();
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } });
  });
  it("starts from the seed, and an empty saved list stays empty", () => {
    expect(loadManualEntries(mockFinanceEntries, "VND")).toBe(mockFinanceEntries);
    expect(saveManualEntries([])).toBe(true);
    expect(m.get(FINANCE_KEY)).toBe("[]");
    expect(loadManualEntries(mockFinanceEntries, "VND")).toEqual([]);
  });
  it("reports a failed save", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("full"); } } });
    expect(saveManualEntries([])).toBe(false);
  });
});

describe("mock finance data", () => {
  const now = new Date();
  const keys = lastMonthKeys(now, "Asia/Ho_Chi_Minh", 6);
  it("covers every one of the last six months and no entry is dated after today", () => {
    const s = monthlySeries(mockFinanceEntries, "Asia/Ho_Chi_Minh", keys);
    for (const p of s) { expect(p.income + p.expense, p.key).toBeGreaterThan(0); }
    // Entries are business dates (noon UTC), so "not in the future" means not after today's date.
    expect(mockFinanceEntries.every((e) => e.occurredAt.slice(0, 10) <= now.toISOString().slice(0, 10))).toBe(true);
    expect(mockFinanceEntries.every((e) => e.amount > 0 && e.source === "MANUAL")).toBe(true);
  });
  it("has several expense categories to chart", () => {
    expect(byCategory(mockFinanceEntries, "EXPENSE").length).toBeGreaterThanOrEqual(5);
    expect(summarize(mockFinanceEntries).income).toBeGreaterThan(0);
  });
});

describe("charts", () => {
  const series = [
    { key: "2026-09", income: 300, expense: 200, net: 100 },
    { key: "2026-10", income: 0, expense: 300, net: -300 },
  ];
  const labels = { title: "Table", income: "Income", expense: "Expenses", net: "Net", month: "Month", summary: "Chart summary text", format: (n: number) => `$${n}`, monthLabel: (k: string) => k };
  const html = renderToStaticMarkup(createElement(MonthlyChart, { series, currency: "USD", locale: "en", labels }));
  it("is an image with a text summary and a table with the same numbers", () => {
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Chart summary text"');
    expect(html).toContain("<table");
    expect(html).toContain("$300");
    expect(html).toContain("$-300"); // net of the second month, in the table
  });
  it("draws two bars per month and a marker for the net result", () => {
    expect(html.match(/<rect /g)?.length).toBe(4);
    expect(html.match(/<circle /g)?.length).toBe(2);
  });
  it("lists every category with its amount and share", () => {
    const out = renderToStaticMarkup(createElement(CategoryBars, { items: [{ category: "RENT", amount: 75, share: 0.75 }, { category: "SALARY", amount: 25, share: 0.25 }], color: "#000", label: (c) => c, format: (n) => `$${n}`, percent: (s) => `${Math.round(s * 100)}%` }));
    expect(out).toContain("RENT"); expect(out).toContain("$75"); expect(out).toContain("75%"); expect(out).toContain("25%");
  });
  it("shortens big amounts for the axis", () => {
    expect(compactMoney(2_500_000, "VND", "en")).toBe("2.5M");
    expect(compactMoney(150_000, "USD", "en")).toBe("1.5K");
  });
});
