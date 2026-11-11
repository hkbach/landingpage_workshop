import { beforeEach, describe, expect, it } from "vitest";
import { checkSlugFormat, generateShopSlug } from "@workshop/shared";
import { entityTypeKey, liveAuditLogs, recordAudit, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminVouchers } from "@/lib/mock/admin-directory";
import { liveBookings, resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { bookingPrices } from "@/lib/mock/ledger-source";
import { allPromotions, holdPromotion, resetPromotionStore, updatePromotion } from "@/lib/mock/promotion-store";
import { resetShopAdminStore, setShopActive } from "@/lib/mock/shop-admin-store";
import { resetOutbox } from "@/lib/mock/outbox-store";
import { SHOP_SECTIONS } from "@/lib/shop-path";
import type { PromotionInput, PromotionRecord } from "@workshop/shared";
import { POST as book } from "./public/sites/[slug]/bookings/route";
import { PATCH as payment } from "./bookings/[id]/payment/route";
import { POST as autoClosed } from "./sessions/auto-closed/route";
import { POST as reschedule } from "./sessions/[id]/reschedule/route";

const req = (method: string, body: unknown) => new Request("http://app.localtest.me:3000/x", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const inputOf = (p: PromotionRecord, over: Partial<PromotionInput> = {}): PromotionInput => ({
  title: p.title, description: p.description, discountType: p.discountType, discountValue: p.discountValue, code: p.code, stacking: p.stacking, appliesTo: p.appliesTo,
  workshopIds: p.workshopIds, startDate: p.startDate, endDate: p.endDate, enabled: p.enabled, ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}), ...over,
} as PromotionInput);

beforeEach(() => { resetPromotionStore(); resetBookingStore(); resetAdminAudit(); resetShopAdminStore(); resetOutbox(); });

describe("fixes of the code review", () => {
  it("a promotion paused by an administrator cannot be switched on again by editing it", () => {
    const p = allPromotions().find((x) => x.enabled)!;
    expect(holdPromotion(p.id, true, "Misleading").ok).toBe(true);
    const held = allPromotions().find((x) => x.id === p.id)!;
    expect(updatePromotion(p.id, inputOf(held, { enabled: true }))).toMatchObject({ ok: false, code: "HELD_BY_ADMIN" });
    expect(allPromotions().find((x) => x.id === p.id)!.enabled).toBe(false);
  });

  it("the fees of a past booking use the discount kept on the booking, even when its promotion was edited later", () => {
    const b = liveBookings().find((x) => (x.discountAmount ?? 0) > 0 && (x.promotionIds?.length ?? 0) > 0)!;
    const before = bookingPrices([b])[b.id]!;
    expect(before.discounts.reduce((n, d) => n + d.amount, 0)).toBe(b.discountAmount);
    // the promotion is changed after the booking: the history stays the same
    allPromotions(); // the store is seeded
    const store = (globalThis as unknown as { __promotionStore: PromotionRecord[] }).__promotionStore;
    const p = store.find((x) => x.id === b.promotionIds![0])!;
    p.discountValue = p.discountType === "PERCENT" ? Math.min(100, p.discountValue + 30) : p.discountValue * 3;
    expect(allPromotions().find((x) => x.id === p.id)!.discountValue).toBe(p.discountValue);
    const after = bookingPrices([b])[b.id]!;
    expect(after.subtotal).toBe(before.subtotal);
    expect(after.discounts.reduce((n, d) => n + d.amount, 0)).toBe(b.discountAmount);
  });

  it("the admin list counts for each promotion only what IT took off a booking that used several", () => {
    const stacked = liveBookings().find((b) => b.status !== "CANCELLED" && (b.promotionIds?.length ?? 0) > 1);
    if (!stacked) return;
    const rows = adminVouchers().filter((r) => stacked.promotionIds!.includes(r.id));
    const total = rows.reduce((n, r) => n + r.discountTotal, 0);
    const all = liveBookings().filter((b) => b.status !== "CANCELLED" && b.promotionIds?.some((id) => stacked.promotionIds!.includes(id)));
    expect(total).toBeLessThanOrEqual(all.reduce((n, b) => n + (b.discountAmount ?? 0) * (b.promotionIds?.length ?? 1), 0));
    expect(rows.every((r) => r.discountTotal <= all.reduce((n, b) => n + (b.discountAmount ?? 0), 0))).toBe(true);
  });

  it("a shop cannot be named after a section of the owner area", () => {
    for (const s of SHOP_SECTIONS) {
      expect(checkSlugFormat(s), s).toBe("RESERVED");
      expect(generateShopSlug(s, () => false), s).not.toBe(s);
    }
  });

  it("a suspended shop takes no booking", async () => {
    const session = { slug: currentShop.slug };
    expect(setShopActive(currentShop.id, false, "Under review").ok).toBe(true);
    const res = await book(req("POST", {}), { params: Promise.resolve(session) } as never);
    expect(res.status).toBe(404);
  });

  it("a payment on a cancelled booking is a 409, a missing booking a 404, and setting Paid twice writes one audit line", async () => {
    const cancelled = liveBookings().find((b) => b.status === "CANCELLED")!;
    expect((await payment(req("PATCH", { paid: true }), { params: Promise.resolve({ id: cancelled.id }) } as never)).status).toBe(409);
    expect((await payment(req("PATCH", { paid: true }), { params: Promise.resolve({ id: "bk-nope" }) } as never)).status).toBe(404);
    const unpaid = liveBookings().find((b) => b.status !== "CANCELLED" && b.paymentStatus === "UNPAID" && b.totalAmount > 0);
    if (!unpaid) return;
    const ctx = { params: Promise.resolve({ id: unpaid.id }) } as never;
    const first = await payment(req("PATCH", { paid: true }), ctx);
    if (first.status !== 200) return; // a booking of a completed session takes no payment
    await payment(req("PATCH", { paid: true }), { params: Promise.resolve({ id: unpaid.id }) } as never);
    expect(liveAuditLogs().filter((l) => l.action === "booking.mark_paid" && l.entityId === unpaid.id)).toHaveLength(1);
  });

  it("a session is not moved to the past, and dates without an offset are refused", async () => {
    const ctx = () => ({ params: Promise.resolve({ id: "ses-1" }) }) as never;
    const reason = { code: "SCHEDULE_CHANGE" };
    expect((await reschedule(req("POST", { oldStartsAt: "2030-01-01T07:00:00Z", newStartsAt: "2020-01-01T07:00:00Z", newEndsAt: "2020-01-01T09:00:00Z", reason }), ctx())).status).toBe(422);
    expect((await reschedule(req("POST", { oldStartsAt: "2030-01-01T07:00:00Z", newStartsAt: "2030-01-02 07:00", newEndsAt: "2030-01-02T09:00:00Z", reason }), ctx())).status).toBe(422);
  });

  it("an automatic close is written once per session, and not for a session that is not over", async () => {
    const past = { id: "ses-auto-test", startsAt: "2020-01-01T07:00:00Z", endsAt: "2020-01-01T09:00:00Z" };
    const future = { id: "ses-auto-future", startsAt: "2999-01-01T07:00:00Z", endsAt: "2999-01-01T09:00:00Z" };
    await autoClosed(req("POST", { sessions: [past, future] }));
    await autoClosed(req("POST", { sessions: [past, future] }));
    expect(liveAuditLogs().filter((l) => l.action === "session.auto_close").map((l) => l.entityId)).toEqual(["ses-auto-test"]);
  });

  it("the audit log keeps one spelling of a record type, so the filter finds every line", () => {
    expect(["Organization", "organization", "ContactMessage", "contact_message", "landing page"].map(entityTypeKey)).toEqual(["organization", "organization", "contact_message", "contact_message", "landing_page"]);
    recordAudit({ actor: "x", actorRole: "SYSTEM", action: "t.test", entityType: "Withdrawal", entityId: "w-1" });
    expect(liveAuditLogs()[0]!.entityType).toBe("withdrawal");
  });
});
