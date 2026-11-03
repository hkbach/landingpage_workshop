import { describe, expect, it } from "vitest";
import {
  addDaysToKey, bpsToPercent, checkDateRange, checkFeeRates, daysInRange, filterLedgerRange, ledgerSeries, DEFAULT_FEE_RATES, feeOf, feeShares, filterLedger, lastMonthKeys, ledgerFromPayments, monthKey, monthlyLedger,
  feeBase, niceScale, percentToBps, summarizeLedger, type FeeRates, type LedgerRow,
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
  it("keeps the original price and the discount of each voucher on every row of the booking (nothing when it used none)", () => {
    const price = { subtotal: 1_300_000, discounts: [{ code: "EARLY20", amount: 260_000 }, { code: "NEWS5", amount: 65_000 }] };
    const rows = ledgerFromPayments([{ ...src[0]!, price }], RATES);
    expect(rows.map((r) => r.price)).toEqual([price, price]);
    expect(rows[0]!.price).not.toBe(price); // a copy
    expect(ledgerFromPayments(src, RATES).map((r) => r.price)).toEqual([{ subtotal: 0, discounts: [] }, { subtotal: 0, discounts: [] }]);
  });
  describe("the fees are taken on the original price of the booking, not on what was paid after the vouchers", () => {
    // 2 seats of 650,000: 1,300,000 before the vouchers; EARLY20 (260,000) and NEWS5 (65,000) leave 975,000 to pay.
    const price = { subtotal: 1_300_000, discounts: [{ code: "EARLY20", amount: 260_000 }, { code: "NEWS5", amount: 65_000 }] };
    const voucher = { id: "bk-2", bookingCode: "SES-0002-001", currency: "VND", price, payments: [{ id: "q1", type: "PAYMENT" as const, amount: 975_000, recordedAt: "2026-10-01T03:00:00Z" }] };
    it("feeBase puts the amount back on the original price", () => {
      expect(feeBase(975_000, price)).toBe(1_300_000);
      expect(feeBase(-487_500, price)).toBe(-650_000); // half of it refunded: half of the original price
    });
    it("the fees are a percentage of the original price (2% and 3% of 1,300,000), the income is what was paid", () => {
      const [row] = ledgerFromPayments([voucher], RATES);
      expect(row).toMatchObject({ amount: 975_000, maintenanceFee: 26_000, serviceFee: 39_000, profit: 910_000 });
    });
    it("a refund gives back the fees of the same part of the original price", () => {
      const rows = ledgerFromPayments([{ ...voucher, payments: [...voucher.payments, { id: "q2", type: "REFUND" as const, amount: 975_000, recordedAt: "2026-10-02T03:00:00Z" }] }], RATES);
      expect(rows[1]).toMatchObject({ amount: -975_000, maintenanceFee: -26_000, serviceFee: -39_000 });
      expect(summarizeLedger(rows)).toEqual({ income: 0, maintenanceFee: 0, serviceFee: 0, fees: 0, profit: 0 });
    });
    it("without a voucher nothing changes", () => {
      const plain = { ...voucher, price: { subtotal: 1_300_000, discounts: [] }, payments: [{ id: "q3", type: "PAYMENT" as const, amount: 1_300_000, recordedAt: "2026-10-01T03:00:00Z" }] };
      expect(ledgerFromPayments([plain], RATES)[0]).toMatchObject({ maintenanceFee: 26_000, serviceFee: 39_000, profit: 1_235_000 });
    });
    it("with no known original price, or a booking free after its vouchers, the fees are taken on the amount", () => {
      expect(feeBase(1_000, undefined)).toBe(1_000);
      expect(feeBase(1_000, { subtotal: 0, discounts: [] })).toBe(1_000);
      expect(feeBase(1_000, { subtotal: 500_000, discounts: [{ code: "FREE", amount: 500_000 }] })).toBe(1_000);
    });
    it("a voucher can make the fees bigger than what was paid: the profit of that booking is negative", () => {
      const heavy = { subtotal: 1_000_000, discounts: [{ code: "HALF", amount: 900_000 }] }; // 100,000 to pay, fees on 1,000,000
      const [row] = ledgerFromPayments([{ ...voucher, price: heavy, payments: [{ id: "q4", type: "PAYMENT" as const, amount: 100_000, recordedAt: "2026-10-01T03:00:00Z" }] }], { maintenanceBps: 2_000, serviceBps: 3_000 });
      expect(row).toMatchObject({ amount: 100_000, maintenanceFee: 200_000, serviceFee: 300_000, profit: -400_000 });
    });
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
    return { id, bookingCode: id, kind, currency: "VND", price: { subtotal: 0, discounts: [] }, occurredAt, amount, maintenanceFee, serviceFee, profit: amount - maintenanceFee - serviceFee };
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

describe("date range", () => {
  it("is at most 365 days, both ends included", () => {
    expect(checkDateRange("2026-01-01", "2026-12-31")).toBe("OK"); // 365 days
    expect(checkDateRange("2026-01-01", "2027-01-01")).toBe("TOO_LONG"); // 366 days
    expect(checkDateRange("2024-01-01", "2024-12-30")).toBe("OK"); // 365 days in a leap year
    expect(checkDateRange("2024-01-01", "2024-12-31")).toBe("TOO_LONG"); // 366 days
    expect(checkDateRange("2026-05-05", "2026-05-05")).toBe("OK"); // one day
    expect(daysInRange("2026-01-01", "2026-12-31")).toBe(365);
  });
  it("needs both days, real dates, in order", () => {
    expect(checkDateRange("", "2026-05-05")).toBe("REQUIRED");
    expect(checkDateRange("2026-05-05", "")).toBe("REQUIRED");
    expect(checkDateRange("2026-02-30", "2026-03-05")).toBe("INVALID");
    expect(checkDateRange("05/05/2026", "2026-05-06")).toBe("INVALID");
    expect(checkDateRange("2026-05-06", "2026-05-05")).toBe("ORDER");
  });
  it("adds days across a month and a year", () => {
    expect(addDaysToKey("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
  const row = (id: string, amount: number, occurredAt: string): LedgerRow => ({ id, bookingCode: id, kind: amount < 0 ? "REFUND" : "PAYMENT", currency: "VND", price: { subtotal: 0, discounts: [] }, occurredAt, amount, maintenanceFee: 0, serviceFee: 0, profit: amount });
  const rows = [row("1", 100, "2026-10-31T20:00:00Z"), row("2", 200, "2026-11-01T10:00:00Z"), row("3", -50, "2026-11-03T02:00:00Z"), row("4", 400, "2026-12-01T02:00:00Z")];
  it("filters by the shop-local day, both ends included, newest first", () => {
    // 2026-10-31T20:00Z is 1 Nov 03:00 in Ho Chi Minh
    expect(filterLedgerRange(rows, "2026-11-01", "2026-11-03", TZ).map((r) => r.id)).toEqual(["3", "2", "1"]);
    expect(filterLedgerRange(rows, "2026-11-02", "2026-11-02", TZ)).toEqual([]);
    expect(filterLedgerRange(rows, "2026-11-01", "2026-11-03", TZ, "REFUND").map((r) => r.id)).toEqual(["3"]);
  });
  it("draws a short range day by day, with a point for every day", () => {
    const s = ledgerSeries(rows, TZ, "2026-11-01", "2026-11-04");
    expect(s.unit).toBe("day");
    expect(s.points.map((p) => [p.key, p.income])).toEqual([["2026-11-01", 300], ["2026-11-02", 0], ["2026-11-03", -50], ["2026-11-04", 0]]);
  });
  it("draws a long range month by month, across a year change, counting only the days inside the range", () => {
    const s = ledgerSeries(rows, TZ, "2026-11-03", "2027-01-15");
    expect(s.unit).toBe("month");
    expect(s.points.map((p) => p.key)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(s.points.map((p) => p.income)).toEqual([-50, 400, 0]);
  });
  it("31 days are still drawn by day, 32 by month", () => {
    expect(ledgerSeries([], TZ, "2026-11-01", "2026-12-01").unit).toBe("day");
    expect(ledgerSeries([], TZ, "2026-11-01", "2026-12-02").unit).toBe("month");
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
