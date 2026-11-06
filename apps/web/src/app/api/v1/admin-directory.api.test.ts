import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "@/lib/mock/account-status";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { resetFeeRates } from "@/lib/mock/fee-rates-store";
import { resetReferralStore } from "@/lib/mock/referral-store";
import { resetSessionAdminStore } from "@/lib/mock/session-admin-store";
import { resetShopAdminStore } from "@/lib/mock/shop-admin-store";
import { GET as list } from "./admin/directory/[name]/route";
import { GET as fees } from "./admin/fees/route";
import { PUT as putFees } from "./admin/fees/[id]/route";
import { POST as bulk } from "./admin/fees/bulk/route";
import { GET as income } from "./admin/income/route";
import { POST as shopStatus } from "./admin/organizations/[id]/status/route";
import { POST as shopVisibility } from "./admin/organizations/[id]/visibility/route";
import { GET as myLinks, POST as makeLink } from "./customer/[id]/referrals/route";

const json = (body: unknown, method = "POST") => new Request("http://app.localtest.me:3000/x", { method, headers: { "content-type": "application/json", host: "app.localtest.me:3000" }, body: JSON.stringify(body) });
const get = (url: string) => new Request(`http://app.localtest.me:3000${url}`);
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const body = async (res: Response) => (await res.json()) as Record<string, any>;

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetAccountStatus(); resetFeeRates(); resetReferralStore(); resetSessionAdminStore(); resetShopAdminStore(); });

describe("GET /admin/directory/{name}", () => {
  it("gives every list and filters it with q", async () => {
    for (const name of ["users", "shops", "workshops", "bookings", "customers", "sessions", "landing-pages", "referrals"]) {
      const res = await list(get(`/api/v1/admin/directory/${name}`), ctx({ name }));
      expect(res.status, name).toBe(200);
      expect((await body(res)).items.length, name).toBeGreaterThan(0);
    }
    const shops = await body(await list(get("/api/v1/admin/directory/shops?q=hoang%40brewbean"), ctx({ name: "shops" })));
    expect(shops.items.map((s: { id: string }) => s.id)).toEqual(["org-4"]);
  });
  it("404 for an unknown list; 422 for a bad day or From after To", async () => {
    expect((await list(get("/api/v1/admin/directory/nope"), ctx({ name: "nope" }))).status).toBe(404);
    expect((await list(get("/api/v1/admin/directory/bookings?from=yesterday"), ctx({ name: "bookings" }))).status).toBe(422);
    const order = await list(get("/api/v1/admin/directory/bookings?from=2026-02-01&to=2026-01-01"), ctx({ name: "bookings" }));
    expect((await body(order)).error.details.fields).toEqual({ to: "order" });
  });
});

describe("a shop is deactivated and activated", () => {
  it("needs a reason, only ACTIVE <-> SUSPENDED, and hides the shop from the guests list", async () => {
    expect((await shopStatus(json({ active: false }), ctx({ id: "org-5" }))).status).toBe(422);
    expect((await shopStatus(json({ active: false, reason: "Fraud" }), ctx({ id: "org-5" }))).status).toBe(200);
    expect((await shopStatus(json({ active: false, reason: "again" }), ctx({ id: "org-5" }))).status).toBe(409);
    const shops = await body(await list(get("/api/v1/admin/directory/shops?status=SUSPENDED"), ctx({ name: "shops" })));
    expect(shops.items.map((s: { id: string }) => s.id).sort()).toEqual(["org-3", "org-5"]);
    expect((await shopStatus(json({ active: true }), ctx({ id: "org-5" }))).status).toBe(200);
    expect((await shopStatus(json({ active: true }), ctx({ id: "nope" }))).status).toBe(404);
    expect((await shopVisibility(json({ show: false }), ctx({ id: "org-1" }))).status).toBe(200);
    expect((await shopVisibility(json({ show: "no" }), ctx({ id: "org-1" }))).status).toBe(422);
  });
});

describe("the fees", () => {
  it("saves the three rates of a shop and applies rates to all, all or none", async () => {
    const ok = await putFees(json({ maintenanceBps: 100, serviceBps: 200, referralBps: 300 }, "PUT"), ctx({ id: "org-1" }));
    expect(await body(ok)).toEqual({ shopId: "org-1", maintenanceBps: 100, serviceBps: 200, referralBps: 300 });
    const bad = await putFees(json({ maintenanceBps: 100, serviceBps: 200, referralBps: 20_000 }, "PUT"), ctx({ id: "org-1" }));
    expect([bad.status, (await body(bad)).error.details.fields]).toEqual([422, { referralBps: "invalid" }]);
    expect((await putFees(json({ maintenanceBps: 100 }, "PUT"), ctx({ id: "org-1" }))).status).toBe(422);
    expect((await putFees(json({ maintenanceBps: 1, serviceBps: 1, referralBps: 1 }, "PUT"), ctx({ id: "nope" }))).status).toBe(404);

    expect(await body(await bulk(json({ maintenanceBps: 50, serviceBps: 60, referralBps: 70 })))).toEqual({ applied: 5 });
    const all = await body(await fees());
    expect(all.items.every((i: Record<string, number>) => i.maintenanceBps === 50 && i.serviceBps === 60 && i.referralBps === 70)).toBe(true);
    const refused = await bulk(json({ maintenanceBps: 9000, serviceBps: 2000, referralBps: 1 }));
    expect([refused.status, (await body(refused)).error.details.fields]).toEqual([422, { serviceBps: "totalTooHigh" }]);
    expect((await body(await fees())).items[0].maintenanceBps).toBe(50); // nothing was saved
    expect(await body(await bulk(json({ maintenanceBps: 1, serviceBps: 2, referralBps: 3, shopIds: ["org-2"] })))).toEqual({ applied: 1 });
    expect((await bulk(json({ maintenanceBps: 1, serviceBps: 2, referralBps: 3, shopIds: ["nope"] }))).status).toBe(404);
  });
});

describe("GET /admin/income", () => {
  it("gives the fees, the referral fee and the profit of each shop", async () => {
    const res = await body(await income(get("/api/v1/admin/income")));
    const demo = res.shops.find((s: { shopId: string }) => s.shopId === "org-1");
    expect(demo.profit).toBe(demo.fees - demo.referralFee);
    expect(res.totals.length).toBeGreaterThan(0);
    expect((await income(get("/api/v1/admin/income?from=x"))).status).toBe(422);
    expect((await income(get("/api/v1/admin/income?from=2026-02-01&to=2026-01-01"))).status).toBe(422);
  });
});

describe("the referral links of a customer", () => {
  it("makes a link for a workshop, the same one again, and lists them", async () => {
    const workshopId = (await body(await list(get("/api/v1/admin/directory/workshops?q=pasta"), ctx({ name: "workshops" })))).items[0].id;
    const first = await makeLink(json({ workshopId }), ctx({ id: "cu-9" }));
    expect(first.status).toBe(201);
    const link = await body(first);
    expect(link.link).toMatch(/^http:\/\/whiskladle\.localtest\.me:3000\/\?ref=R[0-9A-F]{8}$/);
    expect((await makeLink(json({ workshopId }), ctx({ id: "cu-9" }))).status).toBe(200);
    const mine = (await body(await myLinks(get("/x"), ctx({ id: "cu-9" })))).items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ workshopId, referralBps: 1000, bookings: 0, referralFee: 0, currency: "VND" });
    // a customer whose link brought paid bookings sees the fee it earned: the referral rate x the original price
    const emma = (await body(await myLinks(get("/x"), ctx({ id: "cu-1" })))).items as { referralFee: number; bookings: number }[];
    expect(emma.reduce((n, r) => n + r.referralFee, 0)).toBeGreaterThan(0);
    expect((await makeLink(json({ workshopId: "nope" }), ctx({ id: "cu-9" }))).status).toBe(404);
    expect((await makeLink(json({}), ctx({ id: "cu-9" }))).status).toBe(422);
    expect((await makeLink(json({ workshopId }), ctx({ id: "nobody" }))).status).toBe(404);
  });
});
