import { describe, expect, it } from "vitest";
import { bucketKeys, bucketOf, dayStatsOf, granularityFor, seriesFor, spanDays, totalsOf } from "./bookings-chart";
import type { Booking } from "./types";

const TZ = "Asia/Ho_Chi_Minh";
const b = (id: string, startsAt: string, status: Booking["status"], paymentStatus: Booking["paymentStatus"], quantity = 1) => ({ id, startsAt, status, paymentStatus, quantity }) as Booking;

describe("granularity of a range", () => {
  it("counts both ends of the range", () => expect(spanDays("2026-11-01", "2026-11-30")).toBe(30));
  it("is by day up to 31 days, by week up to 140 days and by month beyond", () => {
    expect(granularityFor("2026-11-01", "2026-11-01")).toBe("day");
    expect(granularityFor("2026-10-01", "2026-10-31")).toBe("day");
    expect(granularityFor("2026-10-01", "2026-11-01")).toBe("week");
    expect(granularityFor("2026-07-01", "2026-11-17")).toBe("week"); // 140 days
    expect(granularityFor("2026-07-01", "2026-11-18")).toBe("month");
  });
});

describe("buckets", () => {
  it("a week starts on Monday", () => {
    expect(bucketOf("2026-11-04", "week")).toBe("2026-11-02"); // Wednesday
    expect(bucketOf("2026-11-08", "week")).toBe("2026-11-02"); // Sunday
    expect(bucketOf("2026-11-09", "week")).toBe("2026-11-09");
  });
  it("a month is its year and month", () => expect(bucketOf("2026-11-04", "month")).toBe("2026-11"));
  it("has one key for every day, week or month of the range, oldest first", () => {
    expect(bucketKeys("2026-11-01", "2026-11-03", "day")).toEqual(["2026-11-01", "2026-11-02", "2026-11-03"]);
    expect(bucketKeys("2026-11-04", "2026-11-17", "week")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    expect(bucketKeys("2026-11-20", "2027-02-02", "month")).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });
  it("keeps at most 36 months", () => expect(bucketKeys("2020-01-01", "2026-12-31", "month")).toHaveLength(36));
});

describe("counting the bookings", () => {
  const list = [
    b("1", "2026-11-03T02:00:00Z", "CHECKED_IN", "PAID", 2), b("2", "2026-11-03T07:00:00Z", "CONFIRMED", "UNPAID", 1),
    b("3", "2026-11-03T17:30:00Z", "CANCELLED", "UNPAID", 3), // 00:30 on the 4th in Ho Chi Minh
    b("4", "2026-11-10T02:00:00Z", "NOT_CONFIRMED", "UNPAID", 1),
  ];
  it("counts the bookings by the day of their session in the shop time zone, by outcome and by payment status", () => {
    const days = dayStatsOf(list, TZ);
    expect(days.find((d) => d.day === "2026-11-03")).toMatchObject({ total: 2, guests: 3, attended: 1, upcoming: 1, lost: 0, paid: 1, unpaid: 1 });
    expect(days.find((d) => d.day === "2026-11-04")).toMatchObject({ total: 1, guests: 3, lost: 1, unpaid: 1 });
  });
  it("only the days inside the range are counted, and every bucket of the range is there", () => {
    const { granularity, buckets } = seriesFor(dayStatsOf(list, TZ), "2026-11-03", "2026-11-05");
    expect(granularity).toBe("day");
    expect(buckets.map((x) => x.key)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(buckets.map((x) => x.total)).toEqual([2, 1, 0]);
    expect(totalsOf(buckets).total).toBe(3); // the booking of the 10th is outside
  });
  it("a longer range is counted by week", () => {
    const { granularity, buckets } = seriesFor(dayStatsOf(list, TZ), "2026-11-02", "2026-12-06");
    expect(granularity).toBe("week");
    expect(buckets[0]).toMatchObject({ key: "2026-11-02", total: 3 });
    expect(buckets[1]).toMatchObject({ key: "2026-11-09", total: 1 });
  });
  it("totals with the share paid and cancelled", () => {
    const t = totalsOf(seriesFor(dayStatsOf(list, TZ), "2026-11-01", "2026-11-30").buckets);
    expect(t).toMatchObject({ total: 4, guests: 7, paid: 1, lost: 1 });
    expect(t.paidRate).toBeCloseTo(0.25);
    expect(totalsOf([]).paidRate).toBe(0);
  });
});
