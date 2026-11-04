import { describe, expect, it } from "vitest";
import { isSessionBookable } from "@workshop/shared";
import { currentShop, sessions as demoSessions, shops, workshops as demoWorkshops } from "./data";
import { otherShops, otherShopSites } from "./other-shops";
import { getPublicSite } from "./site";

// The two extra shops give the Workshops page of the guest area more than one shop to show; they must not disturb the demo shop.

describe("the other shops", () => {
  it("are two ACTIVE shops, chosen for the Workshops page, in the list of shops with ids and slugs of their own", () => {
    expect(otherShops).toHaveLength(2);
    for (const s of otherShops) {
      expect(s.status).toBe("ACTIVE");
      expect(s.showOnCustomerPage).toBe(true);
      expect(shops).toContain(s);
    }
    expect(new Set(shops.map((s) => s.id)).size).toBe(shops.length);
    expect(new Set(shops.map((s) => s.slug)).size).toBe(shops.length);
    expect(otherShops.some((s) => s.currency !== currentShop.currency)).toBe(true); // another currency to look at
  });
  it("have three ACTIVE workshops and a draft each, whose ids and session codes never meet those of the demo shop", () => {
    const ids = new Set([...demoWorkshops.map((w) => w.id), ...demoSessions.map((s) => s.id)]);
    const codes = new Set(demoSessions.map((s) => s.code));
    for (const shop of otherShops) {
      const site = otherShopSites[shop.id]!;
      expect(site.workshops.filter((w) => w.status === "ACTIVE")).toHaveLength(3);
      expect(site.workshops.filter((w) => w.status === "DRAFT")).toHaveLength(1);
      for (const w of site.workshops) { expect(w.currency).toBe(shop.currency); expect(ids.has(w.id), w.id).toBe(false); ids.add(w.id); }
      for (const s of site.sessions) {
        expect(site.workshops.some((w) => w.id === s.workshopId), s.id).toBe(true);
        expect(s.reservedCount).toBeLessThanOrEqual(s.capacity);
        expect(ids.has(s.id), s.id).toBe(false); ids.add(s.id);
        expect(codes.has(s.code), s.code).toBe(false); codes.add(s.code);
        expect(Date.parse(s.endsAt)).toBeGreaterThan(Date.parse(s.startsAt));
      }
    }
  });
  it("show every situation of a session: bookable with seats, sold out, paused, open, closed", () => {
    const all = otherShops.flatMap((s) => otherShopSites[s.id]!.sessions);
    expect(all.some((s) => isSessionBookable(s.status) && s.reservedCount < s.capacity)).toBe(true);
    expect(all.some((s) => isSessionBookable(s.status) && s.reservedCount === s.capacity)).toBe(true);
    for (const status of ["PAUSED", "OPEN", "CLOSED"] as const) expect(all.some((s) => s.status === status), status).toBe(true);
  });
  it("have a landing page: the public site of each gives its ACTIVE workshops only, and a page to show", () => {
    for (const shop of otherShops) {
      const site = getPublicSite(shop.slug)!;
      expect(site.shop.id).toBe(shop.id);
      expect(site.workshops.every((w) => w.status === "ACTIVE")).toBe(true);
      expect(site.sessions.every((s) => site.workshops.some((w) => w.id === s.workshopId))).toBe(true);
      expect(site.content.sections.some((s) => s.type === "workshops" && s.enabled)).toBe(true);
    }
  });
  it("do not change the demo shop: its sessions and workshops are still its own", () => {
    expect(demoWorkshops.map((w) => w.id)).toEqual(["ws-1", "ws-2", "ws-3", "ws-4", "ws-5"]);
    expect(getPublicSite(currentShop.slug)!.workshops.every((w) => demoWorkshops.some((d) => d.id === w.id))).toBe(true);
  });
});
