import { beforeEach, describe, expect, it } from "vitest";
import { resetAccountStatus } from "./account-status";
import { resetAccountsStore } from "./accounts-store";
import { adminBookings, adminCustomers, adminLandingPages, adminAffiliate, adminSessions, adminShops, adminUsers, adminWorkshops } from "./admin-directory";
import { adminIncome, checkIncomeRange, referralEarnings } from "./admin-income";
import { liveBookings, registerGuestAccount, resetBookingStore } from "./booking-store";
import { currentShop, shops } from "./data";
import { applyRatesToAll, DEFAULT_REFERRAL_BPS, getFeeRates, getReferralBps, resetFeeRates, setAllRates } from "./fee-rates-store";
import { adminChangeSession, resetSessionAdminStore } from "./session-admin-store";
import { attributedBookings, createReferral, listReferrals, resetReferralStore } from "./referral-store";
import { liveShops, resetShopAdminStore, setShopActive, setShowOnCustomerPage } from "./shop-admin-store";

beforeEach(() => {
  resetBookingStore(); resetAccountsStore(); resetAccountStatus(); resetFeeRates(); resetReferralStore(); resetSessionAdminStore(); resetShopAdminStore();
});

describe("users", () => {
  it("lists shop owners and customers with the account type, and searches name, email, id and shop", () => {
    const all = adminUsers();
    expect(new Set(all.map((u) => u.type))).toEqual(new Set(["SHOP_OWNER", "CUSTOMER"]));
    expect(adminUsers("emma@example").map((u) => u.id)).toEqual(["cu-1"]);
    expect(adminUsers("Whisk").map((u) => u.type)).toEqual(["SHOP_OWNER"]); // the shop name finds its owner
    expect(adminUsers("", "CUSTOMER").every((u) => u.type === "CUSTOMER")).toBe(true);
    expect(adminUsers("cu-1")[0]?.bookings).toBeGreaterThan(0);
  });
});

describe("shops", () => {
  it("searches the shop name and the email of the owner", () => {
    expect(adminShops("whisk ladle").map((s) => s.id)).toEqual([]); // words must be next to each other
    expect(adminShops("whisk").map((s) => s.id)).toEqual(["org-1"]);
    expect(adminShops("hoang@brewbean").map((s) => s.id)).toEqual(["org-4"]);
    expect(adminShops("", "SUSPENDED").map((s) => s.id)).toEqual(["org-3"]);
  });
  it("deactivates an ACTIVE shop with a reason and activates it again; other statuses are refused", () => {
    expect(setShopActive("org-1", false)).toEqual({ ok: false, code: "REASON_REQUIRED" });
    expect(setShopActive("org-1", false, "Reported")).toMatchObject({ ok: true, shop: { status: "SUSPENDED", statusReason: "Reported" } });
    expect(setShopActive("org-1", false, "again")).toEqual({ ok: false, code: "NOT_ALLOWED" });
    expect(setShopActive("org-1", true)).toMatchObject({ ok: true, shop: { status: "ACTIVE" } });
    expect(liveShops().find((s) => s.id === "org-1")!.statusReason).toBeUndefined();
    expect(setShopActive("org-2", true)).toEqual({ ok: false, code: "NOT_ALLOWED" }); // in review
    expect(setShopActive("nope", true)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(setShowOnCustomerPage("org-5", false)).toBe(true);
    expect(adminShops("greentable")[0]!.showOnCustomerPage).toBe(false);
  });
});

describe("workshops", () => {
  it("lists the workshops of every shop and searches by workshop or shop", () => {
    const all = adminWorkshops();
    expect(new Set(all.map((w) => w.shopId)).size).toBeGreaterThanOrEqual(3);
    expect(adminWorkshops("pasta").length).toBeGreaterThan(0);
    expect(adminWorkshops("brew bean").every((w) => w.shopName === "Brew & Bean Coffee Lab")).toBe(true);
    expect(adminWorkshops("zzzz")).toEqual([]);
  });
});

describe("bookings", () => {
  it("searches the code, the workshop, the shop, and the email or the id of the person", () => {
    const b = liveBookings()[0]!;
    expect(adminBookings(b.bookingCode).map((x) => x.id)).toEqual([b.id]);
    expect(adminBookings("emma@example.com").every((x) => x.customerEmail === "emma@example.com")).toBe(true);
    expect(adminBookings("cu-1").length).toBeGreaterThan(0);
    expect(adminBookings(currentShop.name).length).toBe(liveBookings().length);
    expect(adminBookings(b.workshopTitle.slice(0, 8)).length).toBeGreaterThan(0);
  });
  it("filters by the day the booking was made, both days included", () => {
    const day = adminBookings()[0]!.createdAt.slice(0, 10);
    const same = adminBookings("", day, day);
    expect(same.length).toBeGreaterThan(0);
    expect(adminBookings("", "2999-01-01", "")).toEqual([]);
    expect(adminBookings("", "", "1999-01-01")).toEqual([]);
  });
});

describe("customers", () => {
  it("lists the emails with their bookings and finds them by the shop where they booked", () => {
    registerGuestAccount({ email: "newbie@example.com", fullName: "Newbie", country: "VN", birthDate: "2000-01-01", categories: ["ART", "CRAFTS", "POTTERY"] });
    const all = adminCustomers();
    expect(new Set(all.map((c) => c.email)).size).toBe(all.length);
    expect(adminCustomers("newbie")[0]).toMatchObject({ bookings: 0, shops: [], accountId: expect.any(String) });
    const booked = adminCustomers(currentShop.name);
    expect(booked.length).toBeGreaterThan(0);
    expect(booked.every((c) => c.bookings > 0 && c.shops.includes(currentShop.name))).toBe(true);
  });
});

describe("sessions", () => {
  it("lists the sessions of every shop and searches code, workshop, status, day, notes and shop", () => {
    const all = adminSessions();
    expect(new Set(all.map((s) => s.shopId)).size).toBeGreaterThanOrEqual(3);
    const s = all[0]!;
    expect(adminSessions(s.code).map((x) => x.id)).toContain(s.id);
    expect(adminSessions(s.startsAt.slice(0, 10)).map((x) => x.id)).toContain(s.id);
    expect(adminSessions("greentable").every((x) => x.shopId === "org-5")).toBe(true);
    expect(adminSessions("", "CLOSED").every((x) => x.status === "CLOSED")).toBe(true);
  });
  it("an administrator can close and open a session of another shop, more than 3 times", () => {
    const target = adminSessions("", "RUNNING", "org-4").find((s) => new Date(s.endsAt) > new Date())!;
    for (let i = 0; i < 5; i++) {
      expect(adminChangeSession(target.id, "close", `reason ${i}`).ok).toBe(true);
      expect(adminChangeSession(target.id, "reopen", "").ok).toBe(true);
    }
    const now = adminSessions(target.code)[0]!;
    expect(now.status).toBe("OPEN");
    expect(now.closes).toBe(0); // the owner's limit of closes is not used by an administrator
    expect(now.notes?.filter((n) => n.type === "CLOSED" && n.by === "ADMIN")).toHaveLength(5);
  });
});

describe("landing pages", () => {
  it("searches by shop name", () => {
    expect(adminLandingPages("brew").map((p) => p.slug)).toEqual(["brewbean"]);
    expect(adminLandingPages().length).toBe(shops.length);
    expect(adminLandingPages("sugar")[0]!.editable).toBe(false);
  });
});

describe("referrals", () => {
  it("lists the links with the account and finds them by the email of the person", () => {
    const all = adminAffiliate();
    expect(all.length).toBe(listReferrals().length);
    expect(adminAffiliate("emma@example.com").every((r) => r.accountEmail === "emma@example.com")).toBe(true);
    expect(adminAffiliate("nobody@example.com")).toEqual([]);
  });
  it("makes one link per account and workshop, for ACTIVE shops only", () => {
    const wid = adminWorkshops("pasta")[0]!.id;
    const first = createReferral("cu-9", wid);
    expect(first).toMatchObject({ ok: true, created: true });
    expect(createReferral("cu-9", wid)).toMatchObject({ ok: true, created: false });
    expect(createReferral("nobody", wid)).toEqual({ ok: false, code: "NO_ACCOUNT" });
    expect(createReferral("cu-9", "nope")).toEqual({ ok: false, code: "NO_WORKSHOP" });
    setShopActive("org-1", false, "x");
    expect(createReferral("cu-4", adminWorkshops("pasta")[0]!.id)).toEqual({ ok: false, code: "SHOP_INACTIVE" });
  });
  it("never attributes the booking of the person who shares the link", () => {
    const mine = new Map(listReferrals().map((r) => [r.id, r.accountId]));
    for (const [bookingId, linkId] of attributedBookings()) expect(liveBookings().find((b) => b.id === bookingId)!.customerId).not.toBe(mine.get(linkId));
  });
});

describe("fees", () => {
  it("starts with 10% for every fee (of the original price)", () => {
    expect(DEFAULT_REFERRAL_BPS).toBe(1000);
    expect(getFeeRates("org-2")).toEqual({ maintenanceBps: 1000, serviceBps: 1000 });
  });
  it("sets the three rates of a shop, refusing a wrong one without saving anything", () => {
    expect(setAllRates("org-1", { maintenanceBps: 100, serviceBps: 250, referralBps: 500 })).toBe("OK");
    expect(getFeeRates("org-1")).toEqual({ maintenanceBps: 100, serviceBps: 250 });
    expect(getReferralBps("org-1")).toBe(500);
    expect(setAllRates("org-1", { maintenanceBps: 100, serviceBps: 250, referralBps: 10_001 })).toBe("REFERRAL_INVALID");
    expect(setAllRates("org-1", { maintenanceBps: 9000, serviceBps: 2000, referralBps: 1 })).toBe("TOTAL_TOO_HIGH");
    expect(getReferralBps("org-1")).toBe(500);
    expect(getReferralBps("org-2")).toBe(DEFAULT_REFERRAL_BPS);
  });
  it("applies the same rates to all the shops, or to none", () => {
    expect(applyRatesToAll(shops.map((s) => s.id), { maintenanceBps: 1, serviceBps: 2, referralBps: 3 })).toBe("OK");
    for (const s of shops) expect([getFeeRates(s.id), getReferralBps(s.id)]).toEqual([{ maintenanceBps: 1, serviceBps: 2 }, 3]);
    expect(applyRatesToAll(shops.map((s) => s.id), { maintenanceBps: -1, serviceBps: 2, referralBps: 3 })).toBe("MAINTENANCE_INVALID");
    expect(getFeeRates("org-5")).toEqual({ maintenanceBps: 1, serviceBps: 2 });
  });
});

describe("income of the platform", () => {
  it("profit = the fees charged to the shops - the referral fees", () => {
    const inc = adminIncome();
    const demo = inc.shops.find((s) => s.shopId === "org-1")!;
    expect(demo.fees).toBe(demo.maintenanceFee + demo.serviceFee);
    expect(demo.profit).toBe(demo.fees - demo.referralFee - demo.inviteBonus);
    expect(demo.fees).toBeGreaterThan(0);
    expect(demo.referralFee).toBeGreaterThanOrEqual(0);
    expect(inc.shops.filter((s) => s.shopId !== "org-1").every((s) => s.fees === 0 && s.profit === 0)).toBe(true);
    const total = inc.totals.find((t) => t.currency === demo.currency)!;
    expect(total.profit).toBe(total.fees - total.referralFee - total.inviteBonus);
  });
  it("follows the rates of each shop and the referral rate", () => {
    const base = adminIncome().shops.find((s) => s.shopId === "org-1")!;
    setAllRates("org-1", { maintenanceBps: 0, serviceBps: 0, referralBps: 1000 });
    const zero = adminIncome().shops.find((s) => s.shopId === "org-1")!;
    expect(zero.fees).toBe(0);
    expect(zero.referralFee).toBeGreaterThan(0); // the referral fee does not depend on the other fees: it is a percentage of the original price
    expect(zero.profit).toBe(-zero.referralFee - zero.inviteBonus);
    expect(zero.income).toBe(base.income);
    setAllRates("org-1", { maintenanceBps: 200, serviceBps: 300, referralBps: 0 });
    const noRef = adminIncome().shops.find((s) => s.shopId === "org-1")!;
    expect(noRef.referralFee).toBe(0);
    expect(noRef.profit).toBe(noRef.fees - noRef.inviteBonus);
  });
  it("the referral fee is a percentage of the ORIGINAL price: at 100% it is the original price of the referred bookings, and the profit of the platform is then minus that", () => {
    setAllRates("org-1", { maintenanceBps: 0, serviceBps: 0, referralBps: 10_000 });
    const d = adminIncome().shops.find((s) => s.shopId === "org-1")!;
    expect(d.referralFee).toBeGreaterThan(0);
    expect(d.referralFee).toBeLessThan(d.basePrice);
    expect(d.profit).toBe(-d.referralFee - d.inviteBonus);
    setAllRates("org-1", { maintenanceBps: 500, serviceBps: 0, referralBps: 100 });
    const e = adminIncome().shops.find((s) => s.shopId === "org-1")!;
    expect(Math.abs(e.maintenanceFee - e.basePrice * 0.05)).toBeLessThan(e.bookings + 1); // 5% of the original price (rounded per payment)
    expect(Math.abs(e.referralFee - d.referralFee / 100)).toBeLessThan(e.bookings + 1); // 1% of the same bookings
    expect(e.profit).toBe(e.fees - e.referralFee - e.inviteBonus);
  });
  it("narrows to a range of days and checks it", () => {
    expect(adminIncome("2999-01-01").shops.every((s) => s.income === 0)).toBe(true);
    expect(checkIncomeRange("2026-01-01", "2025-01-01")).toBe("ORDER");
    expect(checkIncomeRange("nope")).toBe("INVALID");
    expect(checkIncomeRange("2026-01-01", "2026-02-01")).toBe("OK");
  });
  it("the fee each referral link earned adds up to the referral fee of the shops", () => {
    const earned = [...referralEarnings().values()].reduce((n, e) => n + e.fee, 0);
    expect(earned).toBe(adminIncome().shops.reduce((n, s) => n + s.referralFee, 0));
    expect(earned).toBeGreaterThan(0); // the demo data has referred bookings that were paid
  });
});
