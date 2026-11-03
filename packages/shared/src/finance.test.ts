import { describe, expect, it } from "vitest";
import {
  bpsToPercent, checkFeeRates, DEFAULT_FEE_RATES, feeOf, feeShares, filterLedger, lastMonthKeys, ledgerFromPayments, monthKey, monthlyLedger,
  niceScale, percentToBps, summarizeLedger, type FeeRates, type LedgerRow,
} from "./finance";

const TZ = "Asia/Ho_Chi_Minh";
const RATES: FeeRates = { maintenanceBps: 200, serviceBps: 300 }; // 2% and 3%

describe("fee rates", () => {
  it("accept whole basis points from 0 to 100%, together at most 100%", () => {
    expect(checkFeeRates(DEFAULT_FEE_RATES)).toBe("OK");
    expect(checkFeeRates({ maintenanceBps: 0, serviceBps: 0 })).toBe("OK");
    expect(checkFeeRates({ maintenanceBps: 10_000, serviceBps: 0 })).toBe("OK");
    expect(checkFeeRates({ maintenanceBps: -1, serviceBps: 0 })).toBe("MAINTENANCE_INVALID");
    expect(checkFeeRates({ maintenanceBps: 1.5, serviceBps: 0 })).toBe("MAINTENANCE_INVALID");
    expect(checkFeeRates({ maintenanceBps: 0, serviceBps: 10_001 })).toBe("SERVICE_INVALID");
    expect(checkFeeRates({ maintenanceBps: 0, serviceBps: "3" })).toBe("SERVICE_INVALID");
    expect(checkFeeRates({ maintenanceBps: 6_000, serviceBps: 4_001 })).toBe("TOTAL_TOO_HIGH");
  });
  it("a typed percentage becomes basis points, with at most 2 decimals", () => {
    expect(percentToBps("2")).toBe(200);
    expect(percentToBps(" 2.5 ")).toBe(250);
    expect(percentToBps("2,75")).toBe(275);
    expect(percentToBps("0")).toBe(0);
    expect(percentToBps("100")).toBe(10_000);
    for (const bad of ["", "abc", "-1", "101", "2.555", "1e2", "2%", "."]) expect(percentToBps(bad), bad).toBeNull();
  });
  it("basis points go back to the text of a percentage", () => {
    expect(bpsToPercent(200)).toBe("2");
    expect(bpsToPercent(250)).toBe("2.5");
    expect(bpsToPercent(25)).toBe("0.25");
    for (const bps of [0, 1, 25, 250, 9_999, 10_000]) expect(percentToBps(bpsToPercent(bps))).toBe(bps);
  });
});

describe("feeOf", () => {
  it("is a percentage of the amount, rounded to the minor unit", () => {
    expect(feeOf(1_000_000, 200)).toBe(20_000);
    expect(feeOf(999, 250)).toBe(25); // 24.975
    expect(feeOf(100, 0)).toBe(0);
    expect(feeOf(0, 300)).toBe(0);
  });
  it("gives the fee back for a refund", () => {
    expect(feeOf(-1_000_000, 200)).toBe(-20_000);
    expect(feeOf(-999, 250)).toBe(-25);
  });
});

describe("ledgerFromPayments", () => {
  const src = [{
    id: "bk-1", bookingCode: "SES-0001-001", currency: "VND",
    payments: [{ id: "p1", type: "PAYMENT" as const, amount: 1_000_000, recordedAt: "2026-10-01T03:00:00Z" }, { id: "p2", type: "REFUND" as const, amount: 200_000, recordedAt: "2026-10-02T03:00:00Z" }],
  }];
  it("takes both fees from every payment and gives them back on a refund", () => {
    const rows = ledgerFromPayments(src, RATES);
    expect(rows.map((r) => [r.kind, r.amount, r.maintenanceFee, r.serviceFee, r.profit])).toEqual([
      ["PAYMENT", 1_000_000, 20_000, 30_000, 950_000],
      ["REFUND", -200_000, -4_000, -6_000, -190_000],
    ]);
  });
  it("keeps the vouchers the booking used on each of its rows (none when it used none)", () => {
    expect(ledgerFromPayments([{ ...src[0]!, vouchers: ["EARLY20", "NEWS5"] }], RATES).map((r) => r.vouchers)).toEqual([["EARLY20", "NEWS5"], ["EARLY20", "NEWS5"]]);
    expect(ledgerFromPayments(src, RATES).map((r) => r.vouchers)).toEqual([[], []]);
  });
  it("Profit = total income - maintenance fee - service fee", () => {
    const t = summarizeLedger(ledgerFromPayments(src, RATES));
    expect(t).toEqual({ income: 800_000, maintenanceFee: 16_000, serviceFee: 24_000, fees: 40_000, profit: 760_000 });
    expect(t.profit).toBe(t.income - t.maintenanceFee - t.serviceFee);
  });
  it("with no fee the profit is the income; with no payment everything is zero", () => {
    expect(summarizeLedger(ledgerFromPayments(src, { maintenanceBps: 0, serviceBps: 0 })).profit).toBe(800_000);
    expect(summarizeLedger([])).toEqual({ income: 0, maintenanceFee: 0, serviceFee: 0, fees: 0, profit: 0 });
  });
});

describe("months", () => {
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
  const row = (id: string, kind: LedgerRow["kind"], amount: number, occurredAt: string): LedgerRow => {
    const maintenanceFee = feeOf(amount, RATES.maintenanceBps), serviceFee = feeOf(amount, RATES.serviceBps);
    return { id, bookingCode: id, kind, currency: "VND", vouchers: [], occurredAt, amount, maintenanceFee, serviceFee, profit: amount - maintenanceFee - serviceFee };
  };
  const rows = [
    row("1", "PAYMENT", 1000, "2026-09-10T05:00:00Z"),
    row("2", "PAYMENT", 2000, "2026-09-12T05:00:00Z"),
    row("3", "REFUND", -500, "2026-10-02T05:00:00Z"),
    row("4", "PAYMENT", 4000, "2026-10-12T05:00:00Z"),
    row("5", "PAYMENT", 100, "2026-07-01T05:00:00Z"),
  ];
  it("has one point for every month (expense = fees, net = profit), zero where nothing happened", () => {
    expect(monthlyLedger(rows, TZ, ["2026-08", "2026-09", "2026-10"])).toEqual([
      { key: "2026-08", income: 0, expense: 0, net: 0 },
      { key: "2026-09", income: 3000, expense: 150, net: 2850 },
      { key: "2026-10", income: 3500, expense: 175, net: 3325 },
    ]);
  });
  it("filters by months and kind, newest first", () => {
    const months = ["2026-09", "2026-10"];
    expect(filterLedger(rows, months, TZ).map((r) => r.id)).toEqual(["4", "3", "2", "1"]);
    expect(filterLedger(rows, months, TZ, "REFUND").map((r) => r.id)).toEqual(["3"]);
    expect(filterLedger(rows, ["2026-07"], TZ).map((r) => r.id)).toEqual(["5"]);
  });
  it("splits the fees by kind, biggest first, with shares that add up to 1", () => {
    const shares = feeShares(summarizeLedger(rows));
    expect(shares.map((s) => s.category)).toEqual(["SERVICE", "MAINTENANCE"]);
    expect(shares.reduce((n, s) => n + s.share, 0)).toBeCloseTo(1);
    expect(feeShares(summarizeLedger([]))).toEqual([]);
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
