// Mock "public API" for shop sites. Replaced by GET /public/sites/{slug} once apps/api exists.
import type { Session, Shop, Workshop, PageContent, PageTheme, Booking, Customer } from "../types";
import { reservedSeats } from "../booking-state";
import { liveBookings } from "./booking-store";
import { bookings, currentShop, customers, sessions, shops, sitePage, workshops } from "./data";
import { withAdminChanges } from "./session-admin-store";

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
  // Mock: only the current shop has content; published content == draft here.
  if (shop.id !== currentShop.id) return null;
  const active = workshops.filter((w) => w.status === "ACTIVE");
  const ids = new Set(active.map((w) => w.id));
  const live = liveBookings(); // a cancelled booking frees its seats on the landing page too
  return { shop, content: sitePage.draft, theme: sitePage.theme, workshops: active, sessions: withAdminChanges(sessions).filter((s) => ids.has(s.workshopId)).map((s) => ({ ...s, reservedCount: reservedSeats(live, s.id) })) };
}

/** Mock booking lookup: needs the code AND a matching email, otherwise null (generic not-found). */
export function findBookingForLookup(shopId: string, code: string, email: string): { booking: Booking; customer: Customer } | null {
  if (shopId !== currentShop.id || !email) return null;
  const booking = bookings.find((b) => b.bookingCode === code.toUpperCase());
  const customer = booking && customers.find((c) => c.id === booking.customerId);
  if (!booking || !customer?.email) return null;
  return customer.email.trim().toLowerCase() === email.trim().toLowerCase() ? { booking, customer } : null;
}
