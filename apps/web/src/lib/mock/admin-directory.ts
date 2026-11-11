// SERVER-ONLY: the lists of the system admin area (shops, workshops, bookings, customers, sessions, landing pages), until apps/api exists. Each function takes the
// search typed by the admin and returns plain rows. A search ignores case and accents and looks at every field named in its doc. The mock keeps the bookings,
// the customers and the payments of the demo shop only; the other shops have workshops and sessions of their own.
// TODO(api): GET /admin/{shops,workshops,bookings,customers,sessions,landing-pages} with the same filters, page and pageSize, SUPER_ADMIN only.
import { getCustomDomain } from "./shop-domain-store";
import { contactMessages, type ContactMessage } from "./contact-store";
import { allPromotions, promotionHold, shopToday } from "./promotion-store";
import { listMedia } from "./media-store";
import { deliveryOf, outboxEmails } from "./outbox-store";
import { closeCount, closeIfEnded, SESSION_STATUSES, type OrgStatus, type SessionStatus, type WorkshopStatus } from "@workshop/shared";
import { listAccounts, type Account } from "./accounts-store";
import { liveAuditLogs } from "./admin-audit-store";
import { referralEarnings } from "./admin-income";
import { liveBookings, liveCustomers, shopSessions } from "./booking-store";
import { currentShop, workshops as demoWorkshops } from "./data";
import { otherShopSites } from "./other-shops";
import { inviteBonuses, inviteCodeOf, isInviteDisabled, inviteDisabledReason, listInviteCodes, listInvites } from "./invite-store";
import { listReferrals } from "./referral-store";
import { listWithdrawals, walletOf, type WalletSource, type WithdrawalStatus } from "./wallet-store";
import { withAdminChanges } from "./session-admin-store";
import { liveShops } from "./shop-admin-store";
import { withWorkshopStatus } from "./workshop-status-store";
import { matchesSearch } from "../text-search";
import type { AuditEntry, Booking, Session, Shop, Workshop } from "../types";

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
  id: string; title: string; shopId: string; shopName: string; shopSlug: string; editable: boolean; status: WorkshopStatus; categories: string[];
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
      id: w.id, title: titleOf(w.title), shopId: shop.id, shopName: shop.name, shopSlug: shop.slug, editable: shop.id === currentShop.id, status: w.status, categories: w.categories ?? [],
      priceAmount: w.priceAmount, currency: w.currency, durationMinutes: w.durationMinutes, defaultCapacity: w.defaultCapacity, maxPerBooking: w.maxPerBooking, createdAt: w.createdAt,
      ...(w.address ? { address: w.address } : {}), ...(w.addressNote ? { addressNote: w.addressNote } : {}), description: titleOf(w.shortDescription), ...(w.rating ? { rating: w.rating } : {}),
      sessions: sessions.filter((s) => s.workshopId === w.id).length, bookings: bookings.filter((b) => b.workshopId === w.id).length,
    }));
}

// ---- shops -------------------------------------------------------------------------------------------------------------------

export interface AdminShop {
  id: string; name: string; slug: string; status: OrgStatus; statusReason?: string; ownerName: string; ownerEmail: string; country: string; currency: string; timezone: string;
  contactEmail: string; contactPhone: string; whatsapp: string; mapsUrl: string; address: string; defaultLocale: string; enabledLocales: string[]; /** The own domain of the shop ("" when it has none). */ customDomain: string; createdAt: string; showOnCustomerPage: boolean; workshops: number; sessions: number; bookings: number;
}

/** Search: the name (or slug) of the shop, or the email of its owner. */
export function adminShops(q = "", status = ""): AdminShop[] {
  const ws = workshopsWithShop();
  const sessions = allSessions();
  const bookings = liveBookings();
  return liveShops()
    .filter((s) => (!status || s.status === status) && matchesSearch(hay(s.name, s.slug, s.ownerEmail), q))
    .map((s) => ({
      id: s.id, name: s.name, slug: s.slug, status: s.status, ...(s.statusReason ? { statusReason: s.statusReason } : {}), ownerName: s.ownerName, ownerEmail: s.ownerEmail,
      country: s.country, currency: s.currency, timezone: s.timezone, contactEmail: s.contactEmail, contactPhone: s.contactPhone, whatsapp: s.whatsapp ?? "", mapsUrl: s.mapsUrl, address: s.address,
      defaultLocale: s.defaultLocale, enabledLocales: s.enabledLocales, customDomain: getCustomDomain(s.slug), createdAt: s.createdAt,
      showOnCustomerPage: Boolean(s.showOnCustomerPage),
      workshops: ws.filter((x) => x.shop.id === s.id).length, sessions: sessions.filter((x) => x.shopId === s.id).length,
      bookings: s.id === currentShop.id ? bookings.length : 0,
    }));
}

// ---- sessions ----------------------------------------------------------------------------------------------------------------

export interface AdminSession extends Session { shopId: string; shopName: string; shopSlug: string; editable: boolean; workshopTitle: string; closes: number; noteTexts: string[] }

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
      ...live, shopId: shop.id, shopName: shop.name, shopSlug: shop.slug, editable: shop.id === currentShop.id, workshopTitle: w ? titleOf(w.title) : s.workshopId,
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

export interface AdminLandingPage { shopId: string; shopName: string; slug: string; status: OrgStatus; ownerEmail: string; workshops: number; editable: boolean; customDomain: string }

/** Search: the name (or slug) of the shop. `editable`: the shop has a page to edit (the mock has the builder data of the demo shop only). */
export function adminLandingPages(q = ""): AdminLandingPage[] {
  const ws = workshopsWithShop();
  return liveShops()
    .filter((s) => matchesSearch(hay(s.name, s.slug), q))
    .map((s) => ({ shopId: s.id, shopName: s.name, slug: s.slug, status: s.status, ownerEmail: s.ownerEmail, workshops: ws.filter((x) => x.shop.id === s.id).length, editable: s.id === currentShop.id, customDomain: getCustomDomain(s.slug) }));
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

// ---- affiliate (the links of a workshop) ---------------------------------------------------------------------------------------------------------------

export interface AdminAffiliate {
  id: string; code: string; accountId: string; accountEmail: string; accountName: string; workshopId: string; workshopTitle: string; shopId: string; shopName: string; shopSlug: string;
  createdAt: string; clicks: number; bookings: number; referralFee: number; currency: string;
  /** An administrator switched the link off, and why. */
  disabled: boolean; disabledReason: string;
}

/** Search: the email (or name) of the person who registered the account and shares the link, the code of the link, the workshop or the shop. `from` / `to`: the days the link was made. */
export function adminAffiliate(q = "", from = "", to = ""): AdminAffiliate[] {
  const accounts = new Map(listAccounts().map((a) => [a.id, a]));
  const ws = new Map(workshopsWithShop().map((x) => [x.workshop.id, x]));
  const earned = referralEarnings();
  return listReferrals().flatMap((r): AdminAffiliate[] => {
    const a = accounts.get(r.accountId);
    const w = ws.get(r.workshopId);
    if (!a || !w) return [];
    const day = r.createdAt.slice(0, 10);
    if ((from && day < from) || (to && day > to)) return [];
    const e = earned.get(r.id) ?? { bookings: 0, fee: 0 };
    const row: AdminAffiliate = {
      id: r.id, code: r.code, accountId: a.id, accountEmail: a.email, accountName: a.fullName, workshopId: r.workshopId, workshopTitle: titleOf(w.workshop.title), shopId: w.shop.id, shopName: w.shop.name, shopSlug: w.shop.slug,
      createdAt: r.createdAt, clicks: r.clicks, bookings: e.bookings, referralFee: e.fee, currency: w.shop.currency, disabled: Boolean(r.disabled), disabledReason: r.disabledReason ?? "",
    };
    return matchesSearch(hay(row.accountEmail, row.accountName, row.code, row.workshopTitle, row.shopName), q) ? [row] : [];
  });
}

// ---- referrals (the friends a customer invited to register) ----

export interface AdminReferralFriend {
  inviteId: string; inviteeId: string; email: string; name: string; registeredAt: string;
  status: "REGISTERED" | "EARNED"; bookingCode: string; bonus: number; paidAt: string;
}
export interface AdminReferralLink {
  inviterId: string; inviterEmail: string; inviterName: string;
  /** An administrator switched the code off, and why. */
  disabled: boolean; disabledReason: string;
  /** The one invite code of the customer. */
  code: string; currency: string;
  /** How many friends registered through it, how many of them earned the bonus (a paid booking), and the bonus earned in all. */
  registered: number; earned: number; bonusTotal: number;
  friends: AdminReferralFriend[];
}

/**
 * The invite links (one for each customer who has one) with the friends who registered through them. Search: the email or the name of the customer who owns the link, the code, or the
 * email or the name of a friend. `from` / `to` ("YYYY-MM-DD"): the friends who registered on those days (a link keeps only those friends).
 */
export function adminReferralLinks(q = "", from = "", to = ""): AdminReferralLink[] {
  const accounts = new Map(listAccounts().map((a) => [a.id, a]));
  const bonus = new Map(inviteBonuses().map((b) => [b.inviteId, b]));
  const invites = listInvites();
  const inviters = new Set([...listInviteCodes().map(([id]) => id), ...invites.map((i) => i.inviterId)]);
  return [...inviters].flatMap((id): AdminReferralLink[] => {
    const a = accounts.get(id);
    if (!a) return [];
    const friends = invites.filter((i) => i.inviterId === id && (!from || i.registeredAt.slice(0, 10) >= from) && (!to || i.registeredAt.slice(0, 10) <= to)).flatMap((i): AdminReferralFriend[] => {
      const f = accounts.get(i.inviteeId);
      const b = bonus.get(i.id);
      return f ? [{ inviteId: i.id, inviteeId: f.id, email: f.email, name: f.fullName, registeredAt: i.registeredAt, status: b ? "EARNED" : "REGISTERED", bookingCode: b?.bookingCode ?? "", bonus: b?.amount ?? 0, paidAt: b?.paidAt ?? "" }] : [];
    });
    if ((from || to) && friends.length === 0) return [];
    const code = inviteCodeOf(id);
    const row: AdminReferralLink = {
      inviterId: id, inviterEmail: a.email, inviterName: a.fullName, code, currency: currentShop.currency, disabled: isInviteDisabled(id), disabledReason: inviteDisabledReason(id),
      registered: friends.length, earned: friends.filter((f) => f.status === "EARNED").length, bonusTotal: friends.reduce((n, f) => n + f.bonus, 0), friends,
    };
    return matchesSearch(hay(row.inviterEmail, row.inviterName, row.code, ...friends.flatMap((f) => [f.email, f.name])), q) ? [row] : [];
  }).sort((x, y) => y.bonusTotal - x.bonusTotal || x.inviterEmail.localeCompare(y.inviterEmail));
}

// ---- withdrawals (the invoices of the customers) ----

export interface AdminWithdrawal {
  id: string; code: string; accountId: string; accountEmail: string; accountName: string; source: WalletSource; amount: number; currency: string;
  status: WithdrawalStatus; requestedAt: string; processedAt: string; reason: string;
  /** What the customer has earned from the program and still can withdraw (to decide with). */
  available: number;
}

/** Search: the invoice number, or the email or the name of the customer. `status` and `source` narrow the list; `from` / `to` ("YYYY-MM-DD"): the days the invoice was asked for. Pending first, then newest. */
export function adminWithdrawals(q = "", status = "", from = "", to = "", source = ""): AdminWithdrawal[] {
  const accounts = new Map(listAccounts().map((a) => [a.id, a]));
  return listWithdrawals().flatMap((w): AdminWithdrawal[] => {
    const a = accounts.get(w.accountId);
    const day = w.requestedAt.slice(0, 10);
    if (!a || (status && w.status !== status) || (source && w.source !== source) || (from && day < from) || (to && day > to)) return [];
    const row: AdminWithdrawal = {
      id: w.id, code: w.code, accountId: a.id, accountEmail: a.email, accountName: a.fullName, source: w.source, amount: w.amount, currency: w.currency, status: w.status,
      requestedAt: w.requestedAt, processedAt: w.processedAt ?? "", reason: w.reason ?? "", available: walletOf(a.id, w.source).available,
    };
    return matchesSearch(hay(row.code, row.accountEmail, row.accountName), q) ? [row] : [];
  }).sort((x, y) => Number(y.status === "PENDING") - Number(x.status === "PENDING") || y.requestedAt.localeCompare(x.requestedAt));
}

// ---- audit log ----

export interface AdminAuditRow extends AuditEntry { organizationName: string; organizationSlug: string }
export interface AuditFilters { email?: string; org?: string; action?: string; entity?: string; role?: string; from?: string; to?: string }

/**
 * The audit log, newest first. `email`: the email of the user who did it, or of the user it was done to (an administrator resets an account); `org`: the name, the slug or the id of
 * the organization (the shop) it happened in. The rest narrows by action, record type, role of the user and the days (UTC, both included).
 */
export function adminAuditRows(f: AuditFilters = {}): AdminAuditRow[] {
  const shops = new Map(liveShops().map((s) => [s.id, s]));
  return liveAuditLogs()
    .filter((e) => {
      const day = e.createdAt.slice(0, 10);
      return (!f.action || e.action === f.action) && (!f.entity || e.entityType === f.entity) && (!f.role || e.actorRole === f.role) && (!f.from || day >= f.from) && (!f.to || day <= f.to);
    })
    .flatMap((e): AdminAuditRow[] => {
      const shop = e.organizationId ? shops.get(e.organizationId) : undefined;
      const row: AdminAuditRow = { ...e, organizationName: shop?.name ?? "", organizationSlug: shop?.slug ?? "" };
      if (f.email && !matchesSearch(hay(e.actorEmail, e.targetEmail), f.email)) return [];
      if (f.org && !matchesSearch(hay(e.organizationId, row.organizationName, row.organizationSlug), f.org)) return [];
      return [row];
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}


// ---- support inbox (the messages of the Contact form) ----

export type AdminMessage = ContactMessage;

/** Search: the name, the email, the topic or the text of the message; filters: the status and the topic. Newest first. */
export function adminMessages(q = "", status = "", topic = ""): AdminMessage[] {
  return contactMessages().filter((m) => (!status || m.status === status) && (!topic || m.topic === topic) && matchesSearch(hay(m.name, m.email, m.topic, m.message, m.note), q));
}

// ---- emails of the system (the outbox) ----

export interface AdminEmail {
  id: string; type: string; to: string; subject: string; createdAt: string; status: "SENT" | "FAILED"; attempts: number; error: string;
  /** Whether an administrator wrote it (its text can be read); the emails of the system carry secret links and are never shown. */
  written: boolean;
}

/** Search: the address, the subject or the type; filters: the type and the delivery (SENT / FAILED). Newest first. */
export function adminEmails(q = "", type = "", status = ""): AdminEmail[] {
  return outboxEmails()
    .map((e): AdminEmail => {
      const d = deliveryOf(e.id);
      return { id: e.id, type: e.type, to: e.to, subject: e.subject, createdAt: e.createdAt, status: d.status, attempts: d.attempts, error: d.error ?? "", written: e.type === "ADMIN_MESSAGE" };
    })
    .filter((e) => (!type || e.type === type) && (!status || e.status === status) && matchesSearch(hay(e.to, e.subject, e.type), q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}


// ---- vouchers (the promotions of the shops) ----

export interface AdminVoucher {
  id: string; code: string; title: string; shopId: string; shopName: string; discountType: "PERCENT" | "FIXED_AMOUNT"; discountValue: number; currency: string;
  startDate: string; endDate: string; appliesTo: "ALL" | "SELECTED"; workshops: number; stacking: string;
  /** RUNNING / SCHEDULED / PAUSED / EXPIRED, as the shop owner sees it. */
  status: "ACTIVE" | "SCHEDULED" | "PAUSED" | "EXPIRED";
  /** How many bookings used it and how much it took off in all. */
  bookings: number; discountTotal: number;
  /** The reason when an administrator paused it, and when. */
  heldReason: string; heldAt: string;
}

/** Search: the code, the title (every language) or the shop; filter: the status. The mock keeps the promotions of the demo shop only. */
export function adminVouchers(q = "", status = ""): AdminVoucher[] {
  const shop = liveShops().find((s) => s.id === currentShop.id)!;
  const today = shopToday();
  const used = liveBookings().filter((b) => b.status !== "CANCELLED");
  return allPromotions()
    .map((p): AdminVoucher => {
      const bookings = used.filter((b) => b.promotionIds?.includes(p.id));
      const hold = promotionHold(p.id);
      const st = p.enabled ? (p.endDate < today ? "EXPIRED" : p.startDate > today ? "SCHEDULED" : "ACTIVE") : (p.endDate < today ? "EXPIRED" : "PAUSED");
      return {
        id: p.id, code: p.code, title: titleOf(p.title), shopId: shop.id, shopName: shop.name, discountType: p.discountType, discountValue: p.discountValue, currency: shop.currency, startDate: p.startDate, endDate: p.endDate,
        appliesTo: p.appliesTo, workshops: p.workshopIds.length, stacking: p.stacking, status: st, bookings: bookings.length, discountTotal: bookings.reduce((n, b) => n + (b.discountAmount ?? 0), 0), heldReason: hold?.reason ?? "", heldAt: hold?.at ?? "",
      };
    })
    .filter((v) => (!status || v.status === status) && matchesSearch(hay(v.code, v.title, v.shopName, ...allPromotions().filter((p) => p.id === v.id).map((p) => allTitles(p.title))), q))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.code.localeCompare(b.code));
}


// ---- images (the media of the shops) ----

export interface AdminMedia {
  /** For an upload the id of the file; for an image shown from a link a made-up id (`link-...`). */
  id: string;
  /** UPLOAD: a file kept by the platform (it can be removed). LINK: an image a record points to by an address (it can be looked at; the real storage, R2, replaces both). */
  source: "UPLOAD" | "LINK";
  kind: "promotion" | "session" | "workshop";
  url: string; shopId: string; shopName: string;
  /** What shows it: the code of the voucher, the code of the session, the name of the workshop. */
  usedBy: string;
  mime: string; size: number; uploadedAt: string;
}

/** Search: the shop, what shows the image; filters: the kind and the source. Uploads first (newest first), then the images shown from a link. */
export function adminMedia(q = "", kind = "", source = ""): AdminMedia[] {
  const shops = new Map(liveShops().map((s) => [s.id, s]));
  const promos = allPromotions();
  const rows: AdminMedia[] = [];
  for (const m of listMedia()) {
    const url = `/api/v1/media/${m.kind === "session" ? "sessions" : "promotions"}/${m.id}`;
    const users = m.kind === "promotion" ? promos.filter((p) => p.imageUrl === url).map((p) => p.code) : [];
    rows.push({ id: m.id, source: "UPLOAD", kind: m.kind, url, shopId: m.shopId, shopName: shops.get(m.shopId)?.name ?? m.shopId, usedBy: users.join(", "), mime: m.mime, size: m.size, uploadedAt: m.uploadedAt });
  }
  const linked = (id: string, k: AdminMedia["kind"], url: string | undefined, shopId: string, usedBy: string) => {
    if (url && /^https:\/\//.test(url)) rows.push({ id: `link-${id}`, source: "LINK", kind: k, url, shopId, shopName: shops.get(shopId)?.name ?? shopId, usedBy, mime: "", size: 0, uploadedAt: "" });
  };
  for (const { workshop: w, shop } of workshopsWithShop()) linked(`ws-${w.id}`, "workshop", w.coverUrl, shop.id, titleOf(w.title));
  for (const p of promos) linked(`pr-${p.id}`, "promotion", p.imageUrl, currentShop.id, p.code);
  for (const s of shopSessions()) linked(`se-${s.id}`, "session", s.imageUrl, currentShop.id, s.code);
  return rows
    .filter((r) => (!kind || r.kind === kind) && (!source || r.source === source) && matchesSearch(hay(r.shopName, r.usedBy, r.kind), q))
    .sort((a, b) => (a.source === b.source ? b.uploadedAt.localeCompare(a.uploadedAt) : a.source === "UPLOAD" ? -1 : 1));
}
