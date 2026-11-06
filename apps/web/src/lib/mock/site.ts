// Mock "public API" for shop sites. Replaced by GET /public/sites/{slug} once apps/api exists.
import { workshopAddress } from "@workshop/shared";
import type { Session, Shop, Workshop, PageContent, PageTheme, Booking, Customer } from "../types";
import { reservedSeats } from "../booking-state";
import { liveBookings, liveCustomers } from "./booking-store";
import { currentShop, sessions, shops, sitePage, workshops } from "./data";
import { otherShopSites } from "./other-shops";
import { withAdminChanges } from "./session-admin-store";
import { withWorkshopStatus } from "./workshop-status-store";

export interface PublicSite {
  shop: Shop;
  content: PageContent;
  theme: PageTheme;
  workshops: Workshop[];
  sessions: Session[];
}

/** Only ACTIVE shops are public (non-ACTIVE and SUSPENDED => 404, BR-13 / 3.3). */
export function getPublicSite(slug: string): PublicSite | null {
  const shop = shops.find((s) => s.slug === slug);
  if (!shop || shop.status !== "ACTIVE") return null;
  // Mock: the demo shop and the shops of other-shops.ts have content; published content == draft here.
  if (shop.id !== currentShop.id) {
    const other = otherShopSites[shop.id];
    if (!other) return null;
    const active = other.workshops.filter((w) => w.status === "ACTIVE").map((w) => ({ ...w, address: workshopAddress(w, shop.address) }));
    const ids = new Set(active.map((w) => w.id));
    return { shop, content: other.content, theme: other.theme, workshops: active, sessions: other.sessions.filter((s) => ids.has(s.workshopId)) };
  }
  // Guests see the address a workshop is held at: its own, or the address of the shop.
  const active = withWorkshopStatus(workshops).filter((w) => w.status === "ACTIVE").map((w) => ({ ...w, address: workshopAddress(w, shop.address) }));
  const ids = new Set(active.map((w) => w.id));
  const live = liveBookings(); // a cancelled booking frees its seats on the landing page too
  return { shop, content: sitePage.draft, theme: sitePage.theme, workshops: active, sessions: withAdminChanges(sessions).filter((s) => ids.has(s.workshopId)).map((s) => ({ ...s, reservedCount: reservedSeats(live, s.id) })) };
}

/** Mock booking lookup: needs the code AND a matching email, otherwise null (generic not-found). */
export function findBookingForLookup(shopId: string, code: string, email: string): { booking: Booking; customer: Customer } | null {
  if (shopId !== currentShop.id || !email) return null;
  const booking = liveBookings().find((b) => b.bookingCode === code.toUpperCase());
  const customer = booking && liveCustomers().find((c) => c.id === booking.customerId);
  if (!booking || !customer?.email) return null;
  return customer.email.trim().toLowerCase() === email.trim().toLowerCase() ? { booking, customer } : null;
}
