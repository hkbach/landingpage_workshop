import { describe, expect, it } from "vitest";
import {
  activePromotions, countByStatus, discountAmount, discountedPrice, eligiblePromotions, firstOverloadedDay, MAX_CONCURRENT_PROMOTIONS, priceBooking,
  promotionAppliesTo, promotionInputSchema, promotionStatus, STACKING_MODES, type PromotionRecord,
} from "./promotions";
import { isPlatformMediaPath, platformMediaId } from "./media";

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

describe("one image per promotion", () => {
  it("accepts no image, an https image or an image the platform serves", () => {
    expect(promotionInputSchema.safeParse(ok).success).toBe(true);
    expect(promotionInputSchema.safeParse({ ...ok, imageUrl: "" }).success).toBe(true);
    expect(promotionInputSchema.safeParse({ ...ok, imageUrl: "https://cdn.example.com/a.webp" }).success).toBe(true);
    expect(promotionInputSchema.safeParse({ ...ok, imageUrl: "/api/v1/media/promotions/3f2c9a10-aaaa" }).success).toBe(true);
  });
  it("refuses anything else: http, javascript:, data: and other paths", () => {
    for (const bad of ["http://cdn.example.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "/etc/passwd", "/api/v1/media/promotions/../x", "//evil.com/a.png", "x".repeat(501)]) {
      expect(codes({ ...ok, imageUrl: bad }), bad).toContain("imageInvalid");
    }
  });
  it("reads the id of a platform media path", () => {
    expect(isPlatformMediaPath("/api/v1/media/promotions/3f2c9a10-aaaa")).toBe(true);
    expect(isPlatformMediaPath("/api/v1/media/promotions/short")).toBe(false);
    expect(platformMediaId("/api/v1/media/promotions/3f2c9a10-aaaa")).toBe("3f2c9a10-aaaa");
    expect(platformMediaId("https://cdn.example.com/a.png")).toBeNull();
    expect(platformMediaId(undefined)).toBeNull();
  });
});

describe(`at most ${MAX_CONCURRENT_PROMOTIONS} promotions run at once`, () => {
  const p = (startDate: string, endDate: string, enabled = true) => ({ enabled, startDate, endDate });
  const same = (n: number, extra = {}) => Array.from({ length: n }, () => ({ ...p("2026-11-01", "2026-11-30"), ...extra }));
  it("is 5", () => expect(MAX_CONCURRENT_PROMOTIONS).toBe(5));
  it("allows 5 at the same time and refuses the 6th, naming the first day it happens", () => {
    expect(firstOverloadedDay(same(5), "2026-11-01")).toBeNull();
    expect(firstOverloadedDay([...same(5), p("2026-11-10", "2026-11-20")], "2026-11-01")).toBe("2026-11-10");
  });
  it("counts promotions that overlap only partly, not those that follow each other", () => {
    const five = same(5);
    expect(firstOverloadedDay([...five, p("2026-12-01", "2026-12-31")], "2026-11-01")).toBeNull();
    expect(firstOverloadedDay([...five, p("2026-11-30", "2026-12-05")], "2026-11-01")).toBe("2026-11-30");
  });
  it("ignores paused promotions and days that are over", () => {
    expect(firstOverloadedDay([...same(5), p("2026-11-01", "2026-11-30", false)], "2026-11-01")).toBeNull();
    expect(firstOverloadedDay([...same(5, { endDate: "2026-10-31", startDate: "2026-10-01" }), ...same(5)], "2026-11-01")).toBeNull();
    expect(firstOverloadedDay([...same(6, { startDate: "2026-09-01", endDate: "2026-09-30" })], "2026-11-01")).toBeNull();
  });
  it("counts a promotion that started before today from today", () => {
    expect(firstOverloadedDay([...same(5, { startDate: "2026-10-01" }), p("2026-11-05", "2026-11-06")], "2026-11-01")).toBe("2026-11-05");
    expect(firstOverloadedDay(same(6, { startDate: "2026-10-01" }), "2026-11-01")).toBe("2026-11-01");
  });
});

describe("what a guest can pick", () => {
  const list = [
    { id: "a", enabled: true, startDate: "2026-11-01", endDate: "2026-11-30", appliesTo: "ALL" as const, workshopIds: [] as string[] },
    { id: "b", enabled: true, startDate: "2026-11-01", endDate: "2026-11-30", appliesTo: "SELECTED" as const, workshopIds: ["ws-2"] },
    { id: "c", enabled: false, startDate: "2026-11-01", endDate: "2026-11-30", appliesTo: "ALL" as const, workshopIds: [] as string[] },
    { id: "d", enabled: true, startDate: "2026-12-01", endDate: "2026-12-31", appliesTo: "ALL" as const, workshopIds: [] as string[] },
  ];
  it("is the active promotions that cover the workshop", () => {
    expect(eligiblePromotions(list, "ws-1", "2026-11-10").map((x) => x.id)).toEqual(["a"]);
    expect(eligiblePromotions(list, "ws-2", "2026-11-10").map((x) => x.id).sort()).toEqual(["a", "b"]);
    expect(eligiblePromotions(list, "ws-1", "2026-12-10").map((x) => x.id)).toEqual(["d"]);
  });
});

describe("priceBooking", () => {
  const pct = (id: string, v: number) => ({ id, discountType: "PERCENT" as const, discountValue: v });
  const fix = (id: string, v: number) => ({ id, discountType: "FIXED_AMOUNT" as const, discountValue: v });
  const base = { unitPrice: 650_000, quantity: 2 };
  it("is unit price x quantity without a promotion", () => {
    expect(priceBooking({ ...base, stacking: "SINGLE", promotions: [] })).toEqual({ ok: true, subtotal: 1_300_000, discounts: [], discount: 0, total: 1_300_000 });
  });
  it("takes a percentage off the whole booking", () => {
    expect(priceBooking({ ...base, stacking: "SINGLE", promotions: [pct("a", 20)] })).toMatchObject({ ok: true, discount: 260_000, total: 1_040_000 });
  });
  it("takes a fixed amount off the booking, once, not per guest", () => {
    expect(priceBooking({ ...base, stacking: "SINGLE", promotions: [fix("a", 100_000)] })).toMatchObject({ ok: true, discount: 100_000, total: 1_200_000 });
  });
  it("refuses more than one promotion when only one is allowed", () => {
    expect(priceBooking({ ...base, stacking: "SINGLE", promotions: [pct("a", 10), pct("b", 10)] })).toEqual({ ok: false, error: "SINGLE_ONLY" });
  });
  it("combines promotions when several are allowed: fixed amounts first, then each percentage on what is left", () => {
    const r = priceBooking({ ...base, stacking: "MULTIPLE", promotions: [pct("p20", 20), fix("f", 100_000), pct("p10", 10)] });
    expect(r).toMatchObject({ ok: true, subtotal: 1_300_000 });
    if (!r.ok) return;
    expect(r.discounts).toEqual([{ id: "f", amount: 100_000 }, { id: "p20", amount: 240_000 }, { id: "p10", amount: 96_000 }]);
    expect(r.total).toBe(864_000);
    expect(r.discount + r.total).toBe(r.subtotal);
  });
  it("gives the same total whatever order the promotions were chosen in", () => {
    const a = priceBooking({ ...base, stacking: "MULTIPLE", promotions: [pct("x", 20), fix("y", 50_000), pct("z", 15)] });
    const b = priceBooking({ ...base, stacking: "MULTIPLE", promotions: [pct("z", 15), pct("x", 20), fix("y", 50_000)] });
    expect(a.ok && b.ok && a.total === b.total).toBe(true);
  });
  it("never goes below 0", () => {
    const r = priceBooking({ unitPrice: 50_000, quantity: 1, stacking: "MULTIPLE", promotions: [fix("a", 80_000), pct("b", 50), fix("c", 10_000)] });
    expect(r).toMatchObject({ ok: true, total: 0, discount: 50_000 });
  });
  it("knows both stacking modes", () => expect([...STACKING_MODES]).toEqual(["SINGLE", "MULTIPLE"]));
});
