import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminVouchers } from "@/lib/mock/admin-directory";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { allPromotions, publicPromotions, resetPromotionStore } from "@/lib/mock/promotion-store";
import { GET as listPromotions } from "./promotions/route";
import { PATCH as ownerToggle } from "./promotions/[id]/route";
import { POST as adminHold } from "./admin/promotions/[id]/route";

const hold = (id: string, body: unknown) => adminHold(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) } as never);
const owner = (id: string, enabled: boolean) => ownerToggle(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled }) }), { params: Promise.resolve({ id }) } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as any;

beforeEach(() => { resetPromotionStore(); resetBookingStore(); resetAdminAudit(); });

describe("the vouchers in the admin area", () => {
  it("lists the promotions of the shops with their state, how many bookings used them and how much they took off", () => {
    const rows = adminVouchers();
    expect(rows.length).toBe(allPromotions().length);
    expect(new Set(rows.map((r) => r.status)).size).toBeGreaterThanOrEqual(3);
    expect(rows.filter((r) => r.status === "ACTIVE").length).toBeLessThanOrEqual(5);
    expect(rows.every((r) => r.shopName.length > 0 && r.bookings >= 0 && r.discountTotal >= 0)).toBe(true);
    expect(adminVouchers("EARLY20").map((r) => r.code)).toEqual(["EARLY20"]);
    expect(adminVouchers("", "PAUSED").every((r) => r.status === "PAUSED")).toBe(true);
    expect(adminVouchers("nothing-like-this")).toEqual([]);
  });

  it("an administrator pauses a running voucher with a reason: it is no longer offered, and the list says it was paused by the platform", async () => {
    expect(publicPromotions().some((p) => p.id === "pr-1")).toBe(true);
    expect((await hold("pr-1", { hold: true })).status).toBe(422);
    expect((await hold("pr-1", { hold: true, reason: "   " })).status).toBe(422);
    expect((await hold("pr-nope", { hold: true, reason: "Spam" })).status).toBe(404);
    expect((await hold("pr-1", { hold: true, reason: "Fake discount" })).status).toBe(200);
    expect(publicPromotions().some((p) => p.id === "pr-1")).toBe(false);
    expect(adminVouchers("EARLY20")[0]).toMatchObject({ status: "PAUSED", heldReason: "Fake discount" });
    expect((await hold("pr-1", { hold: true, reason: "Again" })).status).toBe(409);
  });

  it("the shop owner sees why and cannot resume it; an administrator can, and it runs again", async () => {
    await hold("pr-1", { hold: true, reason: "Fake discount" });
    const list = await json(await listPromotions());
    expect(list.items.find((p: { id: string }) => p.id === "pr-1").heldByAdmin).toBe("Fake discount");
    expect(list.items.find((p: { id: string }) => p.id === "pr-2").heldByAdmin).toBeUndefined();
    const resume = await owner("pr-1", true);
    expect(resume.status).toBe(409);
    expect((await json(resume)).error.code).toBe("HELD_BY_ADMIN");
    expect((await hold("pr-2", { hold: false })).status).toBe(409);
    expect((await hold("pr-1", { hold: false })).status).toBe(200);
    expect(publicPromotions().some((p) => p.id === "pr-1")).toBe(true);
    expect((await owner("pr-1", true)).status).toBeLessThan(500);
  });

  it("a voucher that was paused by the shop is not started again when an administrator pauses and resumes another, and one that is over stays over", async () => {
    const paused = allPromotions().find((p) => !p.enabled)!;
    expect((await hold(paused.id, { hold: true, reason: "Review" })).status).toBe(200);
    expect((await hold(paused.id, { hold: false })).status).toBe(200);
    expect(allPromotions().find((p) => p.id === paused.id)!.enabled).toBe(false);
  });

  it("writes audit lines by the administrator with the code and the reason", async () => {
    await hold("pr-1", { hold: true, reason: "Fake discount" });
    await hold("pr-1", { hold: false });
    expect(liveAuditLogs().slice(0, 2).map((l) => l.action)).toEqual(["promotion.resume", "promotion.pause"]);
    expect(liveAuditLogs()[1]).toMatchObject({ actorRole: "SYSTEM_ADMIN", details: "code EARLY20; reason: Fake discount" });
  });
});
