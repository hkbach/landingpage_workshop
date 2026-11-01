import { describe, expect, it } from "vitest";
import { bookingSeries, isDailyPeriod, lastDayKeys, outcomeGroup, trendKeys, trendTotals, type BookingPoint } from "./booking-stats";

const TZ = "Asia/Ho_Chi_Minh";
const NOW = new Date("2026-11-01T05:00:00Z"); // 12:00 on 1 Nov in Ho Chi Minh
const p = (startsAt: string, status = "COMPLETED", guests = 2): BookingPoint => ({ startsAt, status, guests });

describe("outcomeGroup", () => {
  it("groups the booking statuses", () => {
    expect(["CHECKED_IN", "COMPLETED"].map(outcomeGroup)).toEqual(["attended", "attended"]);
    expect(outcomeGroup("CONFIRMED")).toBe("upcoming");
    expect(["CANCELLED", "NO_SHOW", "LATE_RELEASED"].map(outcomeGroup)).toEqual(["lost", "lost", "lost"]);
  });
});

describe("keys", () => {
  it("lists 30 local days ending today, oldest first, across a month change", () => {
    const k = lastDayKeys(NOW, TZ, 30);
    expect(k).toHaveLength(30);
    expect(k[29]).toBe("2026-11-01");
    expect(k[0]).toBe("2026-10-03");
  });
  it("uses the shop's today, not the UTC one", () => {
    expect(lastDayKeys(new Date("2026-10-31T20:00:00Z"), TZ, 1)).toEqual(["2026-11-01"]);
    expect(lastDayKeys(new Date("2026-10-31T20:00:00Z"), "UTC", 1)).toEqual(["2026-10-31"]);
  });
  it("is daily for one month and monthly for the longer periods", () => {
    expect(isDailyPeriod("1m")).toBe(true);
    expect(isDailyPeriod("3m")).toBe(false);
    expect(trendKeys("1m", NOW, TZ)).toHaveLength(30);
    expect(trendKeys("3m", NOW, TZ)).toEqual(["2026-09", "2026-10", "2026-11"]);
    expect(trendKeys("6m", NOW, TZ)).toHaveLength(6);
    expect(trendKeys("12m", NOW, TZ)).toHaveLength(12);
    expect(trendKeys("12m", NOW, TZ)[0]).toBe("2025-12");
  });
});

describe("bookingSeries", () => {
  const points = [
    p("2026-11-01T02:00:00Z", "CHECKED_IN", 3),
    p("2026-11-01T08:00:00Z", "CONFIRMED", 1),
    p("2026-10-31T03:00:00Z", "CANCELLED", 2),
    p("2026-10-10T03:00:00Z", "NO_SHOW", 4),
    p("2026-09-05T03:00:00Z", "COMPLETED", 2),
    p("2025-01-05T03:00:00Z"), // outside every period
  ];
  it("counts per day for one month, with a bucket for every day", () => {
    const s = bookingSeries(points, "1m", NOW, TZ);
    expect(s).toHaveLength(30);
    expect(s[29]).toMatchObject({ key: "2026-11-01", attended: 1, upcoming: 1, lost: 0, total: 2, guests: 4 });
    expect(s.find((b) => b.key === "2026-10-31")).toMatchObject({ lost: 1, total: 1 });
    expect(s.filter((b) => b.total === 0).length).toBe(27);
  });
  it("counts per month for 3 months and ignores older bookings", () => {
    const s = bookingSeries(points, "3m", NOW, TZ);
    expect(s.map((b) => [b.key, b.total])).toEqual([["2026-09", 1], ["2026-10", 2], ["2026-11", 2]]);
    expect(trendTotals(s).total).toBe(5);
  });
  it("counts a session at 03:00 on the shop's next day in that day", () => {
    const s = bookingSeries([p("2026-10-31T20:00:00Z")], "1m", NOW, TZ);
    expect(s.find((b) => b.key === "2026-11-01")?.total).toBe(1);
  });
});

describe("trendTotals", () => {
  it("adds up the buckets and gives the share of lost bookings", () => {
    const t = trendTotals(bookingSeries([p("2026-11-01T02:00:00Z"), p("2026-11-01T03:00:00Z", "CANCELLED", 1), p("2026-11-01T04:00:00Z", "CONFIRMED", 5)], "1m", NOW, TZ));
    expect(t).toMatchObject({ total: 3, guests: 8, attended: 1, upcoming: 1, lost: 1 });
    expect(t.lostRate).toBeCloseTo(1 / 3);
  });
  it("is zero without bookings", () => {
    expect(trendTotals([])).toEqual({ total: 0, guests: 0, attended: 0, upcoming: 0, lost: 0, lostRate: 0 });
  });
});
