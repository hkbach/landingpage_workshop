// SERVER-ONLY: the lists of the system admin area (shops, workshops, bookings, customers, sessions, landing pages), until apps/api exists. Each function takes the
// search typed by the admin and returns plain rows. A search ignores case and accents and looks at every field named in its doc. The mock keeps the bookings,
// the customers and the payments of the demo shop only; the other shops have workshops and sessions of their own.
// TODO(api): GET /admin/{shops,workshops,bookings,customers,sessions,landing-pages} with the same filters, page and pageSize, SUPER_ADMIN only.
import { closeCount, closeIfEnded, SESSION_STATUSES, type OrgStatus, type SessionStatus, type WorkshopStatus } from "@workshop/shared";
import { listAccounts, type Account } from "./accounts-store";
import { referralEarnings } from "./admin-income";
import { liveBookings, liveCustomers, shopSessions } from "./booking-store";
import { currentShop, workshops as demoWorkshops } from "./data";
import { otherShopSites } from "./other-shops";
import { listReferrals } from "./referral-store";
import { withAdminChanges } from "./session-admin-store";
import { liveShops } from "./shop-admin-store";
import { withWorkshopStatus } from "./workshop-status-store";
import { matchesSearch } from "../text-search";
import type { Booking, Session, Shop, Workshop } from "../types";

const titleOf = (l: Record<string, string | undefined>): string => l.en ?? Object.values(l).find(Boolean) ?? "";
const allTitles = (l: Record<string, string | undefined>): string => Object.values(l).filter(Boolean).join(" ");
const hay = (...parts: (string | number | undefined | null)[]): string => parts.filter((p) => p !== undefined && p !== null && p !== "").join(" ");
/** "YYYY-MM-DD" of an instant in a time zone. */
const dayIn = (iso: string, tz: string): string => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

// ---- workshops ---------------------------------------------------------------------------------------------------------------

/** Every workshop of every shop, with its shop. */
export function workshopsWithShop(): { workshop: Workshop; shop: Shop }[] {
  const shops = liveShops();
  const demo = shops.find((s) => s.id === currentShop.id)!;
  return [
    ...withWorkshopStatus(demoWorkshops).map((workshop) => ({ workshop, shop: demo })),
    ...Object.entries(otherShopSites).flatMap(([id, site]) => { const shop = shops.find((s) => s.id === id); return shop ? site.workshops.map((workshop) => ({ workshop, shop })) : []; }),
  ];
}

export interface AdminWorkshop {
  id: string; title: string; shopId: string; shopName: string; shopSlug: string; status: WorkshopStatus; category?: string;
  priceAmount: number; currency: string; durationMinutes: number; defaultCapacity: number; maxPerBooking: number; createdAt: string;
  address?: string; addressNote?: string; description: string; rating?: { average: number; count: number };
  sessions: number; bookings: number;
}

/** Search: the title of the workshop (in every language) or the name of the shop. */
export function adminWorkshops(q = "", shopId = ""): AdminWorkshop[] {
  const sessions = allSessions();
  const bookings = liveBookings();
  return workshopsWithShop()
    .filter(({ workshop, shop }) => (!shopId || shop.id === shopId) && matchesSearch(hay(allTitles(workshop.title), shop.name, shop.slug), q))
    .map(({ workshop: w, shop }) => ({
      id: w.id, title: titleOf(w.title), shopId: shop.id, shopName: shop.name, shopSlug: shop.slug, status: w.status, ...(w.category ? { category: w.category } : {}),
      priceAmount: w.priceAmount, currency: w.currency, durationMinutes: w.durationMinutes, defaultCapacity: w.defaultCapacity, maxPerBooking: w.maxPerBooking, createdAt: w.createdAt,
      ...(w.address ? { address: w.address } : {}), ...(w.addressNote ? { addressNote: w.addressNote } : {}), description: titleOf(w.shortDescription), ...(w.rating ? { rating: w.rating } : {}),
      sessions: sessions.filter((s) => s.workshopId === w.id).length, bookings: bookings.filter((b) => b.workshopId === w.id).length,
    }));
}

// ---- shops -------------------------------------------------------------------------------------------------------------------

export interface AdminShop {
  id: string; name: string; slug: string; status: OrgStatus; statusReason?: string; ownerName: string; ownerEmail: string; plan: string; country: string; currency: string; timezone: string;
  contactEmail: string; contactPhone: string; address: string; createdAt: string; showOnCustomerPage: boolean; workshops: number; sessions: number; bookings: number;
}

/** Search: the name (or slug) of the shop, or the email of its owner. */
export function adminShops(q = "", status = ""): AdminShop[] {
  const ws = workshopsWithShop();
  const sessions = allSessions();
  const bookings = liveBookings();
  return liveShops()
    .filter((s) => (!status || s.status === status) && matchesSearch(hay(s.name, s.slug, s.ownerEmail), q))
    .map((s) => ({
      id: s.id, name: s.name, slug: s.slug, status: s.status, ...(s.statusReason ? { statusReason: s.statusReason } : {}), ownerName: s.ownerName, ownerEmail: s.ownerEmail, plan: s.plan,
      country: s.country, currency: s.currency, timezone: s.timezone, contactEmail: s.contactEmail, contactPhone: s.contactPhone, address: s.address, createdAt: s.createdAt,
      showOnCustomerPage: Boolean(s.showOnCustomerPage),
      workshops: ws.filter((x) => x.shop.id === s.id).length, sessions: sessions.filter((x) => x.shopId === s.id).length,
      bookings: s.id === currentShop.id ? bookings.length : 0,
    }));
}

// ---- sessions ----------------------------------------------------------------------------------------------------------------

export interface AdminSession extends Session { shopId: string; shopName: string; shopSlug: string; workshopTitle: string; closes: number; noteTexts: string[] }

/** Every session of every shop as the administrator sees it now (the changes of the administrators and the end of the time applied). */
export function allSessions(now: Date = new Date()): AdminSession[] {
  const shops = liveShops();
  const demo = shops.find((s) => s.id === currentShop.id)!;
  const ws = workshopsWithShop();
  const decorate = (s: Session, shop: Shop): AdminSession => {
    const live = closeIfEnded(s, now);
    const w = ws.find((x) => x.workshop.id === s.workshopId)?.workshop;
    const notes = live.notes ?? [];
    return {
      ...live, shopId: shop.id, shopName: shop.name, shopSlug: shop.slug, workshopTitle: w ? titleOf(w.title) : s.workshopId,
      closes: closeCount(notes), // the closes of the OWNER (the ones of an administrator are not counted in the limit)
      noteTexts: notes.flatMap((n) => [n.type, "reason" in n && n.reason ? `${n.reason.code} ${n.reason.note ?? ""}` : ""]).filter(Boolean),
    };
  };
  return [
    ...shopSessions().map((s) => decorate(s, demo)),
    ...Object.entries(otherShopSites).flatMap(([id, site]) => { const shop = shops.find((x) => x.id === id); return shop ? withAdminChanges(site.sessions).map((s) => decorate(s, shop)) : []; }),
  ];
}

/** Search: the code, the workshop, the status, the day (YYYY-MM-DD), the notes of the session, or the name of the shop. */
export function adminSessions(q = "", status = "", shopId = ""): AdminSession[] {
  const valid = (SESSION_STATUSES as readonly string[]).includes(status);
  return allSessions()
    .filter((s) => (!valid || s.status === (status as SessionStatus)) && (!shopId || s.shopId === shopId) && matchesSearch(hay(s.code, s.workshopTitle, s.shopName, s.status, s.startsAt.slice(0, 10), s.noteTexts.join(" ")), q))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

// ---- bookings ----------------------------------------------------------------------------------------------------------------

export interface AdminBooking {
  id: string; bookingCode: string; status: Booking["status"]; paymentStatus: Booking["paymentStatus"]; source: Booking["source"];
  shopId: string; shopName: string; workshopId: string; workshopTitle: string; sessionId: string; sessionCode: string; startsAt: string; timezone: string;
  customerId: string; guestName: string; customerEmail: string; customerPhone: string; accountId: string;
  quantity: number; unitPriceAmount: number; discountAmount: number; totalAmount: number; currency: string; specialRequest: string; cancelReason: string; createdAt: string; checkedInAt: string;
  payments: Booking["payments"];
}

/**
 * Search: the booking code, the workshop, the shop, and the email or the id of the person (the id of the customer, which is the id of the account when there is one).
 * `from` and `to` ("YYYY-MM-DD", both included) are the days the booking was MADE (shop time zone).
 */
export function adminBookings(q = "", from = "", to = ""): AdminBooking[] {
  const customers = new Map(liveCustomers().map((c) => [c.id, c]));
  const sessions = new Map(allSessions().map((s) => [s.id, s]));
  return liveBookings()
    .filter((b) => { const d = dayIn(b.createdAt, currentShop.timezone); return (!from || d >= from) && (!to || d <= to); })
    .flatMap((b): AdminBooking[] => {
      const c = customers.get(b.customerId);
      const row: AdminBooking = {
        id: b.id, bookingCode: b.bookingCode, status: b.status, paymentStatus: b.paymentStatus, source: b.source,
        shopId: currentShop.id, shopName: currentShop.name, workshopId: b.workshopId, workshopTitle: b.workshopTitle, sessionId: b.sessionId, sessionCode: sessions.get(b.sessionId)?.code ?? "",
        startsAt: b.startsAt, timezone: b.timezone, customerId: b.customerId, guestName: b.guestName ?? c?.fullName ?? "", customerEmail: c?.email ?? "", customerPhone: c?.phone ?? "", accountId: c?.account ? c.id : "",
        quantity: b.quantity, unitPriceAmount: b.unitPriceAmount, discountAmount: b.discountAmount ?? 0, totalAmount: b.totalAmount, currency: b.currency, specialRequest: b.specialRequest ?? "", cancelReason: b.cancelReason ?? "",
        createdAt: b.createdAt, checkedInAt: b.checkedInAt ?? "", payments: b.payments,
      };
      return matchesSearch(hay(row.bookingCode, row.workshopTitle, row.shopName, row.customerEmail, row.customerId, row.guestName), q) ? [row] : [];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---- customers ---------------------------------------------------------------------------------------------------------------

export interface AdminCustomer { email: string; name: string; customerId: string; accountId: string; bookings: number; shops: string[]; lastBookedAt: string; firstBookedAt: string }

/** The emails that booked (and the emails with an account), one row each. Search: the email, the name, or the name of a shop where the email booked a workshop. */
export function adminCustomers(q = ""): AdminCustomer[] {
  const bookings = liveBookings();
  const rows = new Map<string, AdminCustomer>();
  for (const c of liveCustomers()) {
    if (!c.email) continue;
    const key = c.email.trim().toLowerCase();
    const mine = bookings.filter((b) => b.customerId === c.id);
    const prev = rows.get(key);
    const dates = mine.map((b) => b.createdAt).sort();
    rows.set(key, {
      email: key, name: prev?.name ?? c.fullName, customerId: prev?.customerId ?? c.id, accountId: prev?.accountId || (c.account ? c.id : ""),
      bookings: (prev?.bookings ?? 0) + mine.length, shops: mine.length || prev?.shops.length ? [currentShop.name] : [],
      firstBookedAt: [prev?.firstBookedAt, dates[0]].filter(Boolean).sort()[0] ?? "", lastBookedAt: [prev?.lastBookedAt, dates[dates.length - 1]].filter(Boolean).sort().at(-1) ?? "",
    });
  }
  return [...rows.values()].filter((r) => matchesSearch(hay(r.email, r.name, r.shops.join(" ")), q)).sort((a, b) => b.lastBookedAt.localeCompare(a.lastBookedAt) || a.email.localeCompare(b.email));
}

// ---- landing pages -----------------------------------------------------------------------------------------------------------

export interface AdminLandingPage { shopId: string; shopName: string; slug: string; status: OrgStatus; ownerEmail: string; workshops: number; editable: boolean }

/** Search: the name (or slug) of the shop. `editable`: the shop has a page to edit (the mock has the builder data of the demo shop only). */
export function adminLandingPages(q = ""): AdminLandingPage[] {
  const ws = workshopsWithShop();
  return liveShops()
    .filter((s) => matchesSearch(hay(s.name, s.slug), q))
    .map((s) => ({ shopId: s.id, shopName: s.name, slug: s.slug, status: s.status, ownerEmail: s.ownerEmail, workshops: ws.filter((x) => x.shop.id === s.id).length, editable: s.id === currentShop.id }));
}

// ---- users -------------------------------------------------------------------------------------------------------------------

export interface AdminUser extends Account { bookings: number; shopName: string }

/** Search: the name, the email, the phone, the id, or the name of the shop (of a shop owner). `type` and `status` narrow the list. */
export function adminUsers(q = "", type = "", status = ""): AdminUser[] {
  const bookings = liveBookings();
  return listAccounts()
    .filter((a) => (!type || a.type === type) && (!status || a.status === status) && matchesSearch(hay(a.fullName, a.email, a.phone, a.id, a.shop?.name), q))
    .map((a) => ({ ...a, shopName: a.shop?.name ?? "", bookings: a.type === "CUSTOMER" ? bookings.filter((b) => b.customerId === a.id).length : 0 }));
}

// ---- referrals ---------------------------------------------------------------------------------------------------------------

export interface AdminReferral {
  id: string; code: string; accountId: string; accountEmail: string; accountName: string; workshopId: string; workshopTitle: string; shopId: string; shopName: string; shopSlug: string;
  createdAt: string; clicks: number; bookings: number; referralFee: number; currency: string;
}

/** Search: the email (or name) of the person who registered the account and shares the link, the code of the link, the workshop or the shop. `from` / `to`: the days the link was made. */
export function adminReferrals(q = "", from = "", to = ""): AdminReferral[] {
  const accounts = new Map(listAccounts().map((a) => [a.id, a]));
  const ws = new Map(workshopsWithShop().map((x) => [x.workshop.id, x]));
  const earned = referralEarnings();
  return listReferrals().flatMap((r): AdminReferral[] => {
    const a = accounts.get(r.accountId);
    const w = ws.get(r.workshopId);
    if (!a || !w) return [];
    const day = r.createdAt.slice(0, 10);
    if ((from && day < from) || (to && day > to)) return [];
    const e = earned.get(r.id) ?? { bookings: 0, fee: 0 };
    const row: AdminReferral = {
      id: r.id, code: r.code, accountId: a.id, accountEmail: a.email, accountName: a.fullName, workshopId: r.workshopId, workshopTitle: titleOf(w.workshop.title), shopId: w.shop.id, shopName: w.shop.name, shopSlug: w.shop.slug,
      createdAt: r.createdAt, clicks: r.clicks, bookings: e.bookings, referralFee: e.fee, currency: w.shop.currency,
    };
    return matchesSearch(hay(row.accountEmail, row.accountName, row.code, row.workshopTitle, row.shopName), q) ? [row] : [];
  });
}
