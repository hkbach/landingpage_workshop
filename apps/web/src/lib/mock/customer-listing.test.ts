import { describe, expect, it } from "vitest";
import { currentShop, shops } from "./data";
import { listedShops } from "./customer-listing";

// The Workshops page of the guest area lists only the ACTIVE shops the platform administrator chose.

describe("listedShops", () => {
  it("lists the demo shop, which was chosen, with the ACTIVE workshops of its landing page", () => {
    const listed = listedShops();
    expect(listed.map((l) => l.shop.slug)).toEqual([currentShop.slug]);
    expect(listed[0]!.workshops.length).toBeGreaterThan(0);
    expect(listed[0]!.workshops.every((w) => w.status === "ACTIVE")).toBe(true);
    expect(listed[0]!.sessions.every((s) => listed[0]!.workshops.some((w) => w.id === s.workshopId))).toBe(true); // sessions of those workshops only
  });
  it("leaves out a shop the administrator did not choose, even when it is ACTIVE", () => {
    expect(listedShops(shops.map((s) => (s.id === currentShop.id ? { ...s, showOnCustomerPage: false } : s)))).toEqual([]);
    expect(listedShops(shops.map((s) => (s.id === currentShop.id ? { ...s, showOnCustomerPage: undefined } : s)))).toEqual([]);
  });
  it("leaves out a chosen shop that is not ACTIVE (draft, pending review, suspended)", () => {
    for (const status of ["DRAFT", "PENDING_REVIEW", "SUSPENDED"] as const) {
      expect(listedShops(shops.map((s) => (s.id === currentShop.id ? { ...s, status } : s))), status).toEqual([]);
    }
  });
  it("leaves out a chosen shop that has no public site", () => {
    const other = shops.find((s) => s.id !== currentShop.id)!;
    expect(listedShops([{ ...other, status: "ACTIVE", showOnCustomerPage: true }])).toEqual([]); // the mock only has content for the demo shop
  });
  it("lists the promotions of the shop, and the workshops with the seats of the live bookings", () => {
    const [shop] = listedShops();
    expect(shop!.promotions.length).toBeGreaterThan(0);
    for (const s of shop!.sessions) expect(s.reservedCount).toBeLessThanOrEqual(s.capacity);
  });
});
