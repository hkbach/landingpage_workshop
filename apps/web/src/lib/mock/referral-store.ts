// SERVER-ONLY: the referral (affiliate) links, until apps/api exists. A customer with an account picks a workshop and gets a link to share; a booking that comes
// through the link is attributed to it, and the person who shared the link earns a referral fee (a part of the platform fees of that booking, see fee-rates-store).
// Lives on globalThis like the other mock stores.
// TODO(api): `referral_links` (code unique, account_id, workshop_id, organization_id), `bookings.referral_link_id` set from the `?ref=` of the landing page,
// the click counter on the public endpoint, the payout; SUPER_ADMIN reads them.
import { liveBookings, liveCustomers } from "./booking-store";
import { currentShop, workshops as demoWorkshops } from "./data";
import { otherShopSites } from "./other-shops";
import { liveShops } from "./shop-admin-store";
import type { Booking } from "../types";
import { newUuid } from "../uuid";

export interface Referral {
  id: string;
  /** The code in the link (`?ref=CODE`), unique. */
  code: string;
  /** The customer who shares the link. */
  accountId: string;
  workshopId: string;
  shopId: string;
  createdAt: string;
  clicks: number;
}

const DAY = 86_400_000;
const g = globalThis as unknown as { __referrals?: Referral[]; __referralBookings?: Map<string, string> };
/** The bookings made through a link (the code of the link was sent with the booking): booking id -> link id. */
const made = (): Map<string, string> => (g.__referralBookings ??= new Map());

/** The workshops that can be shared: every workshop of every shop that exists in the mock. */
function workshopShop(workshopId: string): string | undefined {
  if (demoWorkshops.some((w) => w.id === workshopId)) return currentShop.id;
  return Object.entries(otherShopSites).find(([, s]) => s.workshops.some((w) => w.id === workshopId))?.[0];
}

/** A few links to look at: customers of the demo data share a workshop of the demo shop and one of another shop. */
function seed(): Referral[] {
  const demo = demoWorkshops.filter((w) => w.status === "ACTIVE");
  const other = Object.values(otherShopSites).flatMap((s) => s.workshops);
  const rows: Array<[string, string | undefined, number, number]> = [
    ["EMMA-FRESH", demo[0]?.id, 1, 12], ["EMMA-WHEEL", demo[1]?.id, 1, 6], ["THU-SHARE", demo[0]?.id, 4, 3], ["YUKI-CRAFT", demo[1]?.id, 5, 5],
    ["WEI-BREW", other[0]?.id, 6, 2], ["KHOA-GREEN", other[other.length - 1]?.id, 7, 1],
  ];
  return rows.flatMap(([code, workshopId, n, days], i) => {
    const shopId = workshopId ? workshopShop(workshopId) : undefined;
    return workshopId && shopId ? [{ id: `rf-${i + 1}`, code, accountId: `cu-${n}`, workshopId, shopId, createdAt: new Date(Date.now() - days * DAY).toISOString(), clicks: 20 + i * 7 }] : [];
  });
}

const store = (): Referral[] => (g.__referrals ??= seed());

/** Test helper: back to the demo links. */
export function resetReferralStore(): void {
  g.__referrals = undefined;
  g.__referralBookings = undefined;
}

export const listReferrals = (): Referral[] => store().map((r) => ({ ...r }));

export type CreateReferralResult = { ok: true; referral: Referral; created: boolean } | { ok: false; code: "NO_ACCOUNT" | "NO_WORKSHOP" | "SHOP_INACTIVE" };

/** A customer with an account gets the link of a workshop (the same link when they already have one for it). Only the workshops of an ACTIVE shop can be shared. */
export function createReferral(accountId: string, workshopId: string): CreateReferralResult {
  if (!liveCustomers().some((c) => c.id === accountId && c.account)) return { ok: false, code: "NO_ACCOUNT" };
  const shopId = workshopShop(workshopId);
  if (!shopId) return { ok: false, code: "NO_WORKSHOP" };
  if (liveShops().find((s) => s.id === shopId)?.status !== "ACTIVE") return { ok: false, code: "SHOP_INACTIVE" };
  const existing = store().find((r) => r.accountId === accountId && r.workshopId === workshopId);
  if (existing) return { ok: true, referral: { ...existing }, created: false };
  const code = `R${newUuid().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  const referral: Referral = { id: `rf-${newUuid().slice(0, 8)}`, code, accountId, workshopId, shopId, createdAt: new Date().toISOString(), clicks: 0 };
  store().push(referral);
  return { ok: true, referral: { ...referral }, created: true };
}

/** Someone opened the link (the landing page of the shop `shopId` was loaded with `?ref=CODE`): false when there is no such link at that shop. */
export function recordClick(code: string, shopId: string): boolean {
  const r = store().find((x) => x.code === code && x.shopId === shopId);
  if (r) r.clicks += 1;
  return Boolean(r);
}

/**
 * A booking is made with the code of a link: it counts for that link when the booking is for the workshop the link is for and is not the booking of the person who
 * shares the link. A code that is not a link, another workshop or one's own booking is ignored (the booking itself is not affected). True when it counts.
 */
export function attributeBooking(bookingId: string, code: string, workshopId: string, customerId: string): boolean {
  const r = store().find((x) => x.code === code);
  if (!r || r.workshopId !== workshopId || r.accountId === customerId) return false;
  made().set(bookingId, r.id);
  return true;
}

/**
 * The bookings that came through a link, by booking id: the ones made with the code of a link (the landing page keeps the `?ref=` and the booking sends it), and, for
 * the demo data that has no such booking, every second booking of a shared workshop (never the booking of the person who shares it) attributed to a link that was
 * opened, so the numbers can be looked at. TODO(api): the referral_link_id kept on the booking; no demo attribution.
 */
export function attributedBookings(bookings: readonly Booking[] = liveBookings()): Map<string, string> {
  const out = new Map<string, string>(made());
  for (const r of store()) {
    if (r.clicks === 0) continue; // a link nobody opened brought no booking
    bookings.filter((b) => b.workshopId === r.workshopId && b.customerId !== r.accountId && b.status !== "CANCELLED").forEach((b, i) => {
      if (i % 2 === 1 && !out.has(b.id)) out.set(b.id, r.id);
    });
  }
  return out;
}
