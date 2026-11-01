import { describe, expect, it } from "vitest";
import {
  activePromotions, countByStatus, discountAmount, discountedPrice, promotionAppliesTo, promotionInputSchema, promotionStatus, type PromotionRecord,
} from "./promotions";

const ok = {
  title: { en: "Summer sale" }, description: { en: "20% off" }, discountType: "PERCENT" as const, discountValue: 20, code: "summer20",
  appliesTo: "ALL" as const, workshopIds: [] as string[], startDate: "2026-11-01", endDate: "2026-11-30", enabled: true,
};
const codes = (v: unknown) => promotionInputSchema.safeParse(v).error?.issues.map((i) => i.message) ?? [];

describe("promotionInputSchema", () => {
  it("accepts a valid promotion and upper-cases the code", () => {
    const r = promotionInputSchema.safeParse(ok);
    expect(r.success).toBe(true);
    expect(r.data?.code).toBe("SUMMER20");
  });
  it("needs a title in at least one language", () => {
    expect(codes({ ...ok, title: {} })).toContain("titleRequired");
    expect(codes({ ...ok, title: { vi: "  " } })).toContain("titleRequired");
    expect(promotionInputSchema.safeParse({ ...ok, title: { vi: "Giảm giá" } }).success).toBe(true);
  });
  it("limits a percentage to 100 and needs a positive whole value", () => {
    expect(codes({ ...ok, discountValue: 101 })).toContain("percentTooHigh");
    expect(codes({ ...ok, discountValue: 0 })).toContain("valueInvalid");
    expect(codes({ ...ok, discountValue: 2.5 })).toContain("valueInvalid");
    expect(promotionInputSchema.safeParse({ ...ok, discountType: "FIXED_AMOUNT", discountValue: 150_000 }).success).toBe(true);
  });
  it("needs a workshop when it applies to selected ones", () => {
    expect(codes({ ...ok, appliesTo: "SELECTED", workshopIds: [] })).toContain("workshopRequired");
    expect(promotionInputSchema.safeParse({ ...ok, appliesTo: "SELECTED", workshopIds: ["ws-1"] }).success).toBe(true);
  });
  it("needs real dates and an end that is not before the start", () => {
    expect(codes({ ...ok, startDate: "2026-02-30" })).toContain("dateInvalid");
    expect(codes({ ...ok, endDate: "soon" })).toContain("dateInvalid");
    expect(codes({ ...ok, startDate: "2026-12-01", endDate: "2026-11-30" })).toContain("endBeforeStart");
    expect(promotionInputSchema.safeParse({ ...ok, startDate: "2026-11-05", endDate: "2026-11-05" }).success).toBe(true);
  });
  it("accepts an empty code but not a malformed one, and limits the text", () => {
    expect(promotionInputSchema.safeParse({ ...ok, code: "" }).success).toBe(true);
    expect(codes({ ...ok, code: "a b" })).toContain("codeInvalid");
    expect(codes({ ...ok, code: "AB" })).toContain("codeInvalid");
    expect(codes({ ...ok, title: { en: "x".repeat(81) } })).toContain("tooLong");
  });
});

describe("status", () => {
  const p = { enabled: true, startDate: "2026-11-05", endDate: "2026-11-10" };
  it("is scheduled before, active during (both days included) and expired after", () => {
    expect(promotionStatus(p, "2026-11-04")).toBe("SCHEDULED");
    expect(promotionStatus(p, "2026-11-05")).toBe("ACTIVE");
    expect(promotionStatus(p, "2026-11-10")).toBe("ACTIVE");
    expect(promotionStatus(p, "2026-11-11")).toBe("EXPIRED");
  });
  it("stays paused whatever the dates", () => {
    expect(promotionStatus({ ...p, enabled: false }, "2026-11-07")).toBe("PAUSED");
    expect(promotionStatus({ ...p, enabled: false }, "2027-01-01")).toBe("PAUSED");
  });
  it("lists only the active ones, newest start first, and counts every status", () => {
    const list = [
      { id: "a", ...p }, { id: "b", enabled: true, startDate: "2026-11-06", endDate: "2026-11-20" },
      { id: "c", enabled: false, startDate: "2026-11-01", endDate: "2026-11-30" }, { id: "d", enabled: true, startDate: "2026-12-01", endDate: "2026-12-31" },
      { id: "e", enabled: true, startDate: "2026-10-01", endDate: "2026-10-31" },
    ];
    expect(activePromotions(list, "2026-11-07").map((x) => x.id)).toEqual(["b", "a"]);
    expect(countByStatus(list, "2026-11-07")).toEqual({ ACTIVE: 2, SCHEDULED: 1, EXPIRED: 1, PAUSED: 1, total: 5 });
  });
});

describe("discounts", () => {
  it("takes a percentage off, rounded to a whole minor unit", () => {
    expect(discountAmount(650_000, { discountType: "PERCENT", discountValue: 20 })).toBe(130_000);
    expect(discountedPrice(650_000, { discountType: "PERCENT", discountValue: 20 })).toBe(520_000);
    expect(discountAmount(999, { discountType: "PERCENT", discountValue: 10 })).toBe(100);
  });
  it("takes a fixed amount off but never more than the price", () => {
    expect(discountedPrice(400_000, { discountType: "FIXED_AMOUNT", discountValue: 100_000 })).toBe(300_000);
    expect(discountedPrice(50_000, { discountType: "FIXED_AMOUNT", discountValue: 100_000 })).toBe(0);
    expect(discountAmount(0, { discountType: "PERCENT", discountValue: 50 })).toBe(0);
  });
  it("tells which workshops a promotion covers", () => {
    const all: Pick<PromotionRecord, "appliesTo" | "workshopIds"> = { appliesTo: "ALL", workshopIds: [] };
    const some: Pick<PromotionRecord, "appliesTo" | "workshopIds"> = { appliesTo: "SELECTED", workshopIds: ["ws-2"] };
    expect(promotionAppliesTo(all, "ws-1")).toBe(true);
    expect(promotionAppliesTo(some, "ws-2")).toBe(true);
    expect(promotionAppliesTo(some, "ws-1")).toBe(false);
  });
});
