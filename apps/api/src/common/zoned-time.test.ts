import { describe, expect, it } from "vitest";
import { addDays, dateIn, isRealDate, localParts, ruleStarts, weekdayOf, zonedToUtc } from "./zoned-time";

const VN = "Asia/Ho_Chi_Minh"; // UTC+7, no daylight saving
const NY = "America/New_York"; // UTC-5 / UTC-4, clocks change

describe("zoned-time", () => {
  it("knows the wall clock of a zone at an instant", () => {
    const p = localParts(new Date("2026-11-12T20:30:00Z"), VN);
    expect(p).toMatchObject({ year: 2026, month: 11, day: 13, hour: 3, minute: 30, weekday: 5 }); // already tomorrow in Vietnam
    expect(dateIn(new Date("2026-11-12T20:30:00Z"), VN)).toBe("2026-11-13");
    expect(dateIn(new Date("2026-11-12T20:30:00Z"), NY)).toBe("2026-11-12");
    expect(localParts(new Date("2026-11-12T05:00:00Z"), NY).hour).toBe(0); // midnight is hour 0, never 24
  });

  it("turns a local time into the right instant, with and without daylight saving", () => {
    expect(zonedToUtc("2026-11-14", "09:00", VN)?.toISOString()).toBe("2026-11-14T02:00:00.000Z");
    expect(zonedToUtc("2026-07-01", "09:00", NY)?.toISOString()).toBe("2026-07-01T13:00:00.000Z"); // summer: UTC-4
    expect(zonedToUtc("2026-12-01", "09:00", NY)?.toISOString()).toBe("2026-12-01T14:00:00.000Z"); // winter: UTC-5
  });

  it("skips a time that does not exist and takes the first of a time that happens twice", () => {
    expect(zonedToUtc("2027-03-14", "02:30", NY)).toBeNull(); // clocks jump from 02:00 to 03:00
    expect(zonedToUtc("2027-03-14", "03:30", NY)?.toISOString()).toBe("2027-03-14T07:30:00.000Z");
    expect(zonedToUtc("2026-11-01", "01:30", NY)?.toISOString()).toBe("2026-11-01T05:30:00.000Z"); // the first 01:30 (UTC-4); the second would be 06:30Z
  });

  it("works with dates and weekdays", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(weekdayOf("2026-11-14")).toBe(6); // Saturday
    expect(isRealDate("2026-02-29")).toBe(false);
    expect(isRealDate("2028-02-29")).toBe(true);
    expect(isRealDate("2026-2-3")).toBe(false);
  });

  describe("ruleStarts", () => {
    const rule = { weekdays: [6, 0], startTimes: ["09:00", "14:00"], effectiveFrom: "2026-11-01", effectiveTo: null };

    it("lists the starts of the next 60 days in the time of the shop, in order, later than now", () => {
      const now = new Date("2026-11-12T10:00:00Z"); // Thursday 17:00 in Vietnam
      const starts = ruleStarts(rule, VN, now);
      expect(starts[0]!.toISOString()).toBe("2026-11-14T02:00:00.000Z"); // Saturday 09:00 in Vietnam
      expect(starts[1]!.toISOString()).toBe("2026-11-14T07:00:00.000Z");
      expect(starts.every((s, i) => i === 0 || s > starts[i - 1]!)).toBe(true);
      expect(starts.length).toBeGreaterThanOrEqual(34);
      expect(starts.length).toBeLessThanOrEqual(36);
      const last = starts.at(-1)!;
      expect(last.getTime()).toBeLessThanOrEqual(now.getTime() + 61 * 86_400_000);
    });

    it("never makes a start that has passed, and respects the end date and the first day", () => {
      const now = new Date("2026-11-14T03:00:00Z"); // Saturday 10:00 in Vietnam: the 09:00 is gone
      expect(ruleStarts(rule, VN, now)[0]!.toISOString()).toBe("2026-11-14T07:00:00.000Z");
      expect(ruleStarts({ ...rule, effectiveTo: "2026-11-15" }, VN, new Date("2026-11-12T10:00:00Z"))).toHaveLength(4);
      expect(ruleStarts({ ...rule, effectiveFrom: "2027-01-01" }, VN, new Date("2026-12-20T00:00:00Z")).every((s) => s >= new Date("2027-01-01T00:00:00Z"))).toBe(true);
      expect(ruleStarts({ ...rule, effectiveTo: "2026-11-01" }, VN, new Date("2026-11-12T10:00:00Z"))).toEqual([]);
    });

    it("keeps the same local hour across a daylight-saving change and drops the hour that does not exist", () => {
      const nyRule = { weekdays: [0], startTimes: ["02:30", "09:00"], effectiveFrom: "2027-01-01", effectiveTo: null };
      const starts = ruleStarts(nyRule, NY, new Date("2027-03-01T00:00:00Z"));
      const sundayBefore = starts.find((s) => s.toISOString().startsWith("2027-03-07"))!; // 09:00 in UTC-5
      const sundayAfter = starts.find((s) => s.toISOString().startsWith("2027-03-14"))!; // 09:00 in UTC-4
      expect(sundayBefore.toISOString()).toBe("2027-03-07T07:30:00.000Z"); // 02:30 EST
      expect(starts.some((s) => s.toISOString() === "2027-03-14T07:30:00.000Z")).toBe(false); // 02:30 did not exist on the 14th
      expect(sundayAfter.toISOString()).toBe("2027-03-14T13:00:00.000Z"); // 09:00 EDT
    });

    it("has no duplicates when two times are the same instant", () => {
      expect(ruleStarts({ ...rule, startTimes: ["09:00", "09:00"] }, VN, new Date("2026-11-12T10:00:00Z"), 2)).toHaveLength(1); // Thursday to Saturday: one Saturday
    });
  });
});
