import type { AdminAffiliate, AdminBooking, AdminCustomer, AdminLandingPage, AdminReferralLink, AdminSession, AdminShop, AdminUser, AdminVoucher, AdminWithdrawal, AdminWorkshop } from "@/lib/admin-types";
import type { AdminAuditRow, AdminRating } from "@/lib/admin-types";

// The platform administrator's lists as the API (apps/api) gives them, in the shapes the admin screens use. Each function takes one row of the API. A text that exists in several languages
// ({ en, vi, ... }) becomes the one of the language of the page, else English.

type Localized = Record<string, string>;
const pick = (v: Localized | string | null | undefined): string => {
  if (!v) return "";
  if (typeof v === "string") return v;
  const lang = typeof document !== "undefined" ? document.documentElement.lang.slice(0, 2) : "en";
  return v[lang] ?? v.en ?? Object.values(v)[0] ?? "";
};

/** Where a list is read: most come from `/admin/directory/{name}`; the shops, users and audit log have their own routes. */
export const ADMIN_LIST_PATH: Record<string, string> = { shops: "organizations", users: "users", "audit-logs": "audit-logs" };

type ApiShop = {
  id: string; name: string; slug: string; status: AdminShop["status"]; statusReason?: string | null; country: string; timezone: string; currency: string; contactEmail: string; ownerEmail: string | null;
  ownerName?: string | null; contactPhone?: string; whatsapp?: string | null; mapsUrl?: string; address?: string; defaultLocale?: string; enabledLocales?: string[]; customDomain?: string | null;
  showOnCustomerPage?: boolean; workshopCount: number; sessionCount?: number; bookingCount?: number; createdAt: string;
};
export const shopFrom = (s: ApiShop): AdminShop => ({
  id: s.id, name: s.name, slug: s.slug, status: s.status, ...(s.statusReason ? { statusReason: s.statusReason } : {}), ownerName: s.ownerName ?? "", ownerEmail: s.ownerEmail ?? "", country: s.country, currency: s.currency,
  timezone: s.timezone, contactEmail: s.contactEmail, contactPhone: s.contactPhone ?? "", whatsapp: s.whatsapp ?? "", mapsUrl: s.mapsUrl ?? "", address: s.address ?? "", defaultLocale: s.defaultLocale ?? "en",
  enabledLocales: s.enabledLocales ?? ["en"], customDomain: s.customDomain ?? "", createdAt: s.createdAt, showOnCustomerPage: s.showOnCustomerPage ?? false,
  workshops: s.workshopCount, sessions: s.sessionCount ?? 0, bookings: s.bookingCount ?? 0,
} as AdminShop);

type ApiUser = { id: string; email: string; fullName: string; status: string; type: AdminUser["type"]; shopSlug: string | null; shopName?: string | null; shopId?: string | null; phone?: string | null; bookingCount?: number };
export const userFrom = (u: ApiUser): AdminUser => ({
  id: u.id, type: u.type, email: u.email, fullName: u.fullName, ...(u.phone ? { phone: u.phone } : {}), status: u.status === "DISABLED" ? "DEACTIVATED" : "ACTIVE",
  ...(u.shopSlug ? { shop: { id: u.shopId ?? "", name: u.shopName ?? u.shopSlug, slug: u.shopSlug } } : {}), shopName: u.shopName ?? u.shopSlug ?? "", bookings: u.bookingCount ?? 0,
} as AdminUser);

type ApiAudit = { id: string; action: string; entityType: string; entityId: string; organizationId: string | null; organizationSlug: string | null; organizationName?: string | null; actorUserId: string | null; actorEmail: string | null; actor: string; ip: string | null; createdAt: string };
export const auditFrom = (a: ApiAudit): AdminAuditRow => ({
  id: a.id, ...(a.organizationId ? { organizationId: a.organizationId } : {}), actor: a.actorEmail ?? a.actor, ...(a.actorEmail ? { actorEmail: a.actorEmail } : {}),
  actorRole: a.actor === "USER" ? "CUSTOMER" : "SYSTEM", ...(a.actorUserId ? { actorId: a.actorUserId } : {}), action: a.action, entityType: a.entityType, entityId: a.entityId, ...(a.ip ? { ip: a.ip } : {}), createdAt: a.createdAt,
  organizationName: a.organizationName ?? a.organizationSlug ?? "", organizationSlug: a.organizationSlug ?? "",
});

type ApiBooking = {
  id: string; code: string; status: AdminBooking["status"]; paymentStatus: AdminBooking["paymentStatus"]; source?: AdminBooking["source"]; quantity: number; totalAmount: number; discountAmount: number; paidAmount: number; currency: string;
  guest: { name: string; email: string | null; phone: string; country: string }; specialRequest: string | null; cancelReason: string | null; customerId: string; accountId: string | null; createdAt: string; checkedInAt: string | null;
  workshop: { id: string; title: Localized }; session?: { id: string; code: string; startsAt: string }; shop?: { id: string; name: string; timezone?: string }; unitPriceAmount?: number;
};
export const bookingFrom = (b: ApiBooking): AdminBooking => ({
  id: b.id, bookingCode: b.code, status: b.status, paymentStatus: b.paymentStatus, source: b.source ?? "ONLINE", shopId: b.shop?.id ?? "", shopName: b.shop?.name ?? "", workshopId: b.workshop.id, workshopTitle: pick(b.workshop.title),
  sessionId: b.session?.id ?? "", sessionCode: b.session?.code ?? "", startsAt: b.session?.startsAt ?? b.createdAt, timezone: b.shop?.timezone ?? "UTC", customerId: b.customerId, guestName: b.guest.name,
  customerEmail: b.guest.email ?? "", customerPhone: b.guest.phone, accountId: b.accountId ?? "", quantity: b.quantity, unitPriceAmount: b.unitPriceAmount ?? Math.round((b.totalAmount + b.discountAmount) / Math.max(1, b.quantity)),
  discountAmount: b.discountAmount, totalAmount: b.totalAmount, currency: b.currency, specialRequest: b.specialRequest ?? "", cancelReason: b.cancelReason ?? "", createdAt: b.createdAt, checkedInAt: b.checkedInAt ?? "",
  payments: b.paidAmount > 0 ? [{ id: `paid-${b.id}`, type: "PAYMENT", amount: b.paidAmount, method: "CASH", recordedAt: b.createdAt, recordedBy: "" }] : [],
} as AdminBooking);

type ApiLanding = { shop: { id: string; name: string; slug: string; status: AdminLandingPage["status"]; ownerEmail?: string }; ownDomain: string | null; ownDomainVerified: boolean; pages: { id: string }[]; workshopCount?: number };
export const landingFrom = (l: ApiLanding): AdminLandingPage => ({
  shopId: l.shop.id, shopName: l.shop.name, slug: l.shop.slug, status: l.shop.status, ownerEmail: l.shop.ownerEmail ?? "", workshops: l.workshopCount ?? 0, editable: l.pages.length > 0, customDomain: l.ownDomain ?? "",
});

type ApiAffiliate = Omit<AdminAffiliate, "workshopTitle" | "disabled" | "disabledReason"> & { workshopTitle: Localized | string; disabled?: boolean; disabledReason?: string | null; referralFee?: number };
export const affiliateFrom = (a: ApiAffiliate): AdminAffiliate => ({ ...a, workshopTitle: pick(a.workshopTitle), referralFee: a.referralFee ?? 0, disabled: a.disabled ?? false, disabledReason: a.disabledReason ?? "" });

type ApiPromotion = {
  id: string; code: string; title: Localized | string; shopId: string; shopName: string; discountType: AdminVoucher["discountType"]; discountValue: number; currency: string; startDate: string; endDate: string;
  appliesTo: AdminVoucher["appliesTo"]; workshopIds: string[]; stacking: string; status: AdminVoucher["status"]; usedBookings: number; discountTotal: number; heldByAdmin: string | null; heldAt?: string | null;
};
export const promotionFrom = (p: ApiPromotion): AdminVoucher => ({
  id: p.id, code: p.code, title: pick(p.title), shopId: p.shopId, shopName: p.shopName, discountType: p.discountType, discountValue: p.discountValue, currency: p.currency, startDate: p.startDate, endDate: p.endDate,
  appliesTo: p.appliesTo, workshops: p.workshopIds.length, stacking: p.stacking, status: p.status, bookings: p.usedBookings, discountTotal: p.discountTotal, heldReason: p.heldByAdmin ?? "", heldAt: p.heldAt ?? "",
});

type ApiReferral = {
  accountId: string; accountEmail: string; accountName: string; code: string; disabled: boolean; disabledReason: string | null; friends: number; paidFriends: number; earned: { currency: string; amount: number }[];
  items: { id: string; name: string; email: string; registeredAt: string; status: "REGISTERED" | "EARNED"; bonus: number; bookingCode?: string; paidAt?: string }[];
};
export const referralFrom = (r: ApiReferral): AdminReferralLink => ({
  inviterId: r.accountId, inviterEmail: r.accountEmail, inviterName: r.accountName, disabled: r.disabled, disabledReason: r.disabledReason ?? "", code: r.code, currency: r.earned[0]?.currency ?? "VND",
  registered: r.friends, earned: r.paidFriends, bonusTotal: r.earned[0]?.amount ?? 0,
  friends: r.items.map((f) => ({ inviteId: f.id, inviteeId: f.id, email: f.email, name: f.name, registeredAt: f.registeredAt, status: f.status, bookingCode: f.bookingCode ?? "", bonus: f.bonus, paidAt: f.paidAt ?? "" })),
});

type ApiWithdrawal = {
  id: string; number: string; source: AdminWithdrawal["source"]; currency: string; amount: number; status: AdminWithdrawal["status"]; reason: string | null; requestedAt: string; processedAt: string | null;
  bankName: string; bankAccountHolder: string; accountNumber: string; customer: { id: string; email: string; fullName: string }; available?: number;
};
export const withdrawalFrom = (w: ApiWithdrawal): AdminWithdrawal => ({
  id: w.id, code: w.number, accountId: w.customer.id, accountEmail: w.customer.email, accountName: w.customer.fullName, source: w.source, amount: w.amount, currency: w.currency, status: w.status,
  requestedAt: w.requestedAt, processedAt: w.processedAt ?? "", reason: w.reason ?? "", bankName: w.bankName, accountNumber: w.accountNumber, accountHolder: w.bankAccountHolder, available: w.available ?? 0,
});

type ApiSession = {
  id: string; code: string; startsAt: string; endsAt: string; status: AdminSession["status"]; capacity: number; reserved: number; autoClosed: boolean; history: AdminSession["notes"];
  workshop: { id: string; title: Localized }; shop: { id: string; name: string; slug: string; timezone?: string }; closedForGood: boolean; bookingCutoffMinutes?: number; imageUrl?: string | null;
};
export const sessionFrom = (s: ApiSession): AdminSession => ({
  id: s.id, code: s.code, workshopId: s.workshop.id, startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity, reservedCount: s.reserved, status: s.status, ...(s.autoClosed ? { autoClosed: true } : {}),
  bookingCutoffMinutes: s.bookingCutoffMinutes ?? 0, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}), notes: s.history, shopId: s.shop.id, shopName: s.shop.name, shopSlug: s.shop.slug, timezone: s.shop.timezone ?? "UTC",
  editable: false, workshopTitle: pick(s.workshop.title), closes: s.closedForGood ? 4 : 0, noteTexts: [], viaApi: true,
} as AdminSession);

type ApiCustomer = { email: string; name: string; shops: string[]; bookings: number; firstBookingAt: string; lastBookingAt: string; accountId: string | null; hasAccount: boolean };
export const customerFrom = (c: ApiCustomer): AdminCustomer => ({ email: c.email, name: c.name, customerId: c.accountId ?? "", accountId: c.accountId ?? "", bookings: c.bookings, shops: c.shops, lastBookedAt: c.lastBookingAt, firstBookedAt: c.firstBookingAt });

type ApiWorkshop = {
  id: string; title: Localized; status: AdminWorkshop["status"]; priceAmount: number; currency: string; durationMinutes: number; defaultCapacity: number; address: string; shop: { id: string; name: string; slug: string };
  sessions: number; bookings: number; rating: { average: number | null; count: number }; categories?: string[]; maxPerBooking?: number; createdAt?: string; description?: Localized | string; addressNote?: string;
};
export const workshopFrom = (w: ApiWorkshop): AdminWorkshop => ({
  id: w.id, title: pick(w.title), shopId: w.shop.id, shopName: w.shop.name, shopSlug: w.shop.slug, editable: false, status: w.status, categories: w.categories ?? [], priceAmount: w.priceAmount, currency: w.currency,
  durationMinutes: w.durationMinutes, defaultCapacity: w.defaultCapacity, maxPerBooking: w.maxPerBooking ?? w.defaultCapacity, createdAt: w.createdAt ?? "", ...(w.address ? { address: w.address } : {}), ...(w.addressNote ? { addressNote: w.addressNote } : {}),
  description: pick(w.description), ...(w.rating.average !== null ? { rating: { average: w.rating.average, count: w.rating.count } } : {}), sessions: w.sessions, bookings: w.bookings,
});

type ApiRating = {
  id: string; workshopId: string; workshopTitle: Localized | string; shopName: string; shopSlug?: string; shopId?: string; bookingCode: string; customer: { id: string; name: string; email: string };
  stars: number; comment: string | null; createdAt: string; status: AdminRating["status"]; removedReason: string | null; removedAt?: string | null;
};
export const ratingFrom = (r: ApiRating): AdminRating => ({
  id: r.id, bookingCode: r.bookingCode, workshopId: r.workshopId, workshopTitle: pick(r.workshopTitle), shopId: r.shopId ?? "", shopName: r.shopName, customerName: r.customer.name, customerEmail: r.customer.email,
  stars: r.stars, comment: r.comment ?? "", createdAt: r.createdAt, status: r.status, removedReason: r.removedReason ?? "", removedAt: r.removedAt ?? "",
});

const MAP: Record<string, { fromApi: (row: Record<string, unknown>) => boolean; map: (row: never) => unknown }> = {
  shops: { fromApi: (r) => "workshopCount" in r, map: shopFrom as (row: never) => unknown },
  users: { fromApi: (r) => "emailVerified" in r, map: userFrom as (row: never) => unknown },
  "audit-logs": { fromApi: (r) => "actorUserId" in r, map: auditFrom as (row: never) => unknown },
  bookings: { fromApi: (r) => "code" in r && "guest" in r, map: bookingFrom as (row: never) => unknown },
  "landing-pages": { fromApi: (r) => "shop" in r && "pages" in r, map: landingFrom as (row: never) => unknown },
  affiliate: { fromApi: (r) => typeof r.workshopTitle === "object", map: affiliateFrom as (row: never) => unknown },
  promotions: { fromApi: (r) => "usedBookings" in r, map: promotionFrom as (row: never) => unknown },
  referrals: { fromApi: (r) => typeof r.friends === "number", map: referralFrom as (row: never) => unknown },
  sessions: { fromApi: (r) => "history" in r && "workshop" in r, map: sessionFrom as (row: never) => unknown },
  customers: { fromApi: (r) => "hasAccount" in r, map: customerFrom as (row: never) => unknown },
  workshops: { fromApi: (r) => typeof r.title === "object" && "shop" in r, map: workshopFrom as (row: never) => unknown },
  withdrawals: { fromApi: (r) => "number" in r && "customer" in r, map: withdrawalFrom as (row: never) => unknown },
  ratings: { fromApi: (r) => "stars" in r && typeof r.customer === "object", map: ratingFrom as (row: never) => unknown },
};

/** The rows of a list in the shape of its screen. A row that already has that shape (the sample data) passes through, so the same screens work with both. */
export function adaptRows<T>(name: string, rows: unknown[]): T[] {
  const m = MAP[name];
  return (m ? rows.map((r) => (r && typeof r === "object" && m.fromApi(r as Record<string, unknown>) ? m.map(r as never) : r)) : rows) as T[];
}
