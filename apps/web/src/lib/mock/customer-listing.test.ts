import { describe, expect, it } from "vitest";
import { mapsSearchUrl, workshopDirectionsUrl } from "@workshop/shared";
import { safeMaps } from "@/components/sections/safe-url";
import { currentShop, shops } from "./data";
import { listedShops } from "./customer-listing";

// The Workshops page of the guest area lists only the ACTIVE shops the platform administrator chose.

describe("listedShops", () => {
  it("gives every listed workshop a way to Google Maps that the sites accept: the shop's map link for the shop's address, a search for its own address", () => {
    for (const l of listedShops()) {
      for (const w of l.workshops) {
        const href = workshopDirectionsUrl({ address: w.address }, l.shop); // the address a guest sees is always filled in
        expect(safeMaps(href), `${l.shop.slug} ${w.id}`).toBeDefined();
        expect(href, `${l.shop.slug} ${w.id}`).toBe(w.address === l.shop.address ? l.shop.mapsUrl : mapsSearchUrl(w.address!));
      }
    }
    const demo = listedShops().find((l) => l.shop.id === currentShop.id)!;
    expect(workshopDirectionsUrl({ address: demo.workshops.find((w) => w.id === "ws-4")!.address }, demo.shop)).toContain("google.com/maps/search"); // Dim Sum Night: its own address
  });
  it("lists every shop that was chosen, by name, each with the ACTIVE workshops of its landing page", () => {
    const listed = listedShops();
    expect(listed.map((l) => l.shop.slug)).toEqual(["brewbean", "greentable", currentShop.slug]); // Brew & Bean, Green Table, Whisk & Ladle
    for (const l of listed) {
      expect(l.workshops.length).toBeGreaterThan(0);
      expect(l.workshops.every((w) => w.status === "ACTIVE")).toBe(true);
      expect(l.sessions.every((s) => l.workshops.some((w) => w.id === s.workshopId))).toBe(true); // sessions of those workshops only
    }
  });
  it("says which shop makes a real booking: only the demo shop (the mock keeps no bookings of the others)", () => {
    expect(Object.fromEntries(listedShops().map((l) => [l.shop.slug, l.bookable]))).toEqual({ brewbean: false, greentable: false, [currentShop.slug]: true });
  });
  it("leaves out a shop the administrator did not choose, even when it is ACTIVE", () => {
    const others = (patch: Partial<(typeof shops)[number]>) => shops.map((s) => (s.id === currentShop.id ? { ...s, ...patch } : s));
    expect(listedShops(others({ showOnCustomerPage: false })).map((l) => l.shop.slug)).toEqual(["brewbean", "greentable"]);
    expect(listedShops(others({ showOnCustomerPage: undefined })).map((l) => l.shop.slug)).toEqual(["brewbean", "greentable"]);
    expect(listedShops(shops.map((s) => ({ ...s, showOnCustomerPage: false })))).toEqual([]);
  });
  it("leaves out a chosen shop that is not ACTIVE (draft, suspended)", () => {
    for (const status of ["DRAFT", "SUSPENDED"] as const) {
      expect(listedShops(shops.map((s) => (s.id === currentShop.id ? { ...s, status } : s))).map((l) => l.shop.slug), status).toEqual(["brewbean", "greentable"]);
    }
  });
  it("leaves out a chosen shop that has no public site", () => {
    const org2 = shops.find((s) => s.id === "org-2")!; // a draft, and the mock has no content for it
    expect(listedShops([{ ...org2, status: "ACTIVE", showOnCustomerPage: true }])).toEqual([]);
  });
  it("lists the promotions of the shop, and the workshops with the seats of the live bookings", () => {
    const listed = listedShops();
    const demo = listed.find((l) => l.shop.id === currentShop.id)!;
    expect(demo.promotions.length).toBeGreaterThan(0);
    expect(listed.filter((l) => l.shop.id !== currentShop.id).every((l) => l.promotions.length === 0)).toBe(true); // the promotions in the mock are the demo shop's only
    for (const l of listed) for (const s of l.sessions) expect(s.reservedCount).toBeLessThanOrEqual(s.capacity);
  });
});
