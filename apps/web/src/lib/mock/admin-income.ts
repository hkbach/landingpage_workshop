// SERVER-ONLY: the income of the PLATFORM (the Income page of the system admin), until apps/api exists. It is made of the fees charged on the bookings of the shops
// (maintenance + service, each shop with its own rates, both a percentage of the ORIGINAL price of the booking) minus the referral fees paid to the people whose
// links brought the bookings (the referral rate of the shop, also a percentage of the original price):
// The sum of the maintenance and the service fee is called the income of the admin (`fees` here and in the API):
//   profit of the platform = original price x maintenance + original price x service - original price x affiliate fee (the last one only for bookings that came through an affiliate link)
//                            - the referral bonus (once for each invited friend: the bonus rate of the shop x the original price of the friend's first paid booking).
import { dayKeyOf, feeBase, feeOf, isDayKey, ledgerFromPayments, monthKey, type LedgerRow } from "@workshop/shared";
import { liveBookings } from "./booking-store";
import { currentShop } from "./data";
import { getFeeRates, getReferralBps } from "./fee-rates-store";
import { paymentSources } from "./ledger-source";
import { inviteBonuses } from "./invite-store";
import { attributedBookings, listReferrals } from "./referral-store";
import { liveShops } from "./shop-admin-store";

export interface ShopIncome {
  shopId: string; shopName: string; currency: string;
  /** The payments received on the bookings of the shop, less the refunds. */
  income: number;
  /** The original price of the bookings (before vouchers): what every fee is a percentage of. */
  basePrice: number;
  maintenanceFee: number; serviceFee: number;
  /** maintenanceFee + serviceFee: the INCOME OF THE ADMIN (what the platform charged the shop). */
  fees: number;
  /** What the platform pays for the bookings that came through affiliate links (the affiliate fee). */
  referralFee: number;
  /** What the platform pays customers for the friends they invited whose first booking was paid (the referral bonus). */
  inviteBonus: number;
  /** fees - referralFee - inviteBonus. */
  profit: number;
  bookings: number;
}

export interface Income {
  from: string | null; to: string | null;
  shops: ShopIncome[];
  /** The totals, one per currency (amounts of different currencies are never added together). */
  totals: { currency: string; income: number; basePrice: number; fees: number; referralFee: number; inviteBonus: number; profit: number }[];
}

/** The payments of a shop as ledger rows with the fees of ITS rates, in the days asked for (shop time zone; no range = all of them). */
function shopRows(shopId: string, timeZone: string, from?: string, to?: string): LedgerRow[] {
  if (shopId !== currentShop.id) return []; // the mock keeps the bookings and payments of the demo shop only
  const rows = ledgerFromPayments(paymentSources(liveBookings()), getFeeRates(shopId));
  return rows.filter((r) => { const d = dayKeyOf(r.occurredAt, timeZone); return (!from || d >= from) && (!to || d <= to); });
}

export type IncomeCheck = "OK" | "INVALID" | "ORDER";
export function checkIncomeRange(from?: string, to?: string): IncomeCheck {
  if ((from && !isDayKey(from)) || (to && !isDayKey(to))) return "INVALID";
  return from && to && from > to ? "ORDER" : "OK";
}

/** Booking codes that came through a referral link, with the link. */
function referredCodes(): Map<string, string> {
  const byId = attributedBookings();
  return new Map(liveBookings().flatMap((b) => (byId.has(b.id) ? [[b.bookingCode, byId.get(b.id)!] as const] : [])));
}

export function adminIncome(from?: string, to?: string): Income {
  const referred = referredCodes();
  const bonuses = inviteBonuses();
  const shops = liveShops().map((s): ShopIncome => {
    const rows = shopRows(s.id, s.timezone, from, to);
    const referralBps = getReferralBps(s.id);
    let income = 0, basePrice = 0, maintenanceFee = 0, serviceFee = 0, referralFee = 0;
    for (const r of rows) {
      const base = feeBase(r.amount, r.price); // the original price of this payment (a refund is negative)
      income += r.amount; basePrice += base; maintenanceFee += r.maintenanceFee; serviceFee += r.serviceFee;
      if (referred.has(r.bookingCode)) referralFee += feeOf(base, referralBps);
    }
    const fees = maintenanceFee + serviceFee;
    const inviteBonus = bonuses.filter((b) => b.shopId === s.id && (!from || dayKeyOf(b.paidAt, s.timezone) >= from) && (!to || dayKeyOf(b.paidAt, s.timezone) <= to)).reduce((n, b) => n + b.amount, 0);
    return { shopId: s.id, shopName: s.name, currency: s.currency, income, basePrice, maintenanceFee, serviceFee, fees, referralFee, inviteBonus, profit: fees - referralFee - inviteBonus, bookings: new Set(rows.map((r) => r.bookingCode)).size };
  });
  const totals = [...new Set(shops.map((s) => s.currency))].map((currency) => {
    const mine = shops.filter((s) => s.currency === currency);
    const sum = (k: "income" | "basePrice" | "fees" | "referralFee" | "inviteBonus" | "profit") => mine.reduce((n, s) => n + s[k], 0);
    return { currency, income: sum("income"), basePrice: sum("basePrice"), fees: sum("fees"), referralFee: sum("referralFee"), inviteBonus: sum("inviteBonus"), profit: sum("profit") };
  });
  return { from: from ?? null, to: to ?? null, shops, totals };
}

/** What each referral link earned (the referral rate of the shop x the original price of the bookings it brought; paid to the person who shared it), in the same days. */
export function referralEarnings(from?: string, to?: string): Map<string, { bookings: number; fee: number }> {
  const referred = referredCodes();
  const out = new Map<string, { bookings: number; fee: number }>();
  for (const s of liveShops()) {
    const bps = getReferralBps(s.id);
    const seen = new Set<string>();
    for (const r of shopRows(s.id, s.timezone, from, to)) {
      const link = referred.get(r.bookingCode);
      if (!link) continue;
      const e = out.get(link) ?? { bookings: 0, fee: 0 };
      if (!seen.has(r.bookingCode)) { e.bookings += 1; seen.add(r.bookingCode); }
      e.fee += feeOf(feeBase(r.amount, r.price), bps); // a percentage of the original price, like the other fees
      out.set(link, e);
    }
  }
  for (const r of listReferrals()) if (!out.has(r.id)) out.set(r.id, { bookings: 0, fee: 0 });
  return out;
}

// ---- the detail of the income of one shop: every payment with its fees, and the statement of each month -------------------------------------------------------------------

/** One payment recorded by the shop, with what the platform charged on it. A negative amount is a REVERSAL of a payment that was recorded by mistake (the shop undid it with Unpaid): it gives its fees back. */
export interface IncomeLine {
  id: string; bookingCode: string; occurredAt: string; kind: "PAYMENT" | "REVERSAL"; currency: string;
  /** What the guest paid (signed), and the original price it is a part of: every fee is a percentage of this. */
  amount: number; basePrice: number;
  maintenanceFee: number; serviceFee: number;
  /** The affiliate fee owed for this payment (0 when the booking did not come through a link). */
  referralFee: number; referred: boolean;
  /** maintenanceFee + serviceFee - referralFee. */
  profit: number;
}

/** The statement of one month (the month of the shop): what the system closes at the end of the month, and what the shop owes the platform (maintenance + service fees). */
export interface MonthStatement {
  month: string; payments: number; income: number; basePrice: number; maintenanceFee: number; serviceFee: number;
  /** maintenanceFee + serviceFee: the amount of the invoice the platform sends the shop for the month (sending the invoices is built later). */
  fees: number; referralFee: number; inviteBonus: number; profit: number;
}

export interface ShopIncomeDetail { shopId: string; shopName: string; currency: string; timezone: string; lines: IncomeLine[]; months: MonthStatement[] }

/** The payments of a shop in the days asked for (newest first) and the statement of each month; null for a shop that does not exist. */
export function shopIncomeDetail(shopId: string, from?: string, to?: string): ShopIncomeDetail | null {
  const shop = liveShops().find((s) => s.id === shopId);
  if (!shop) return null;
  const referred = referredCodes();
  const bps = getReferralBps(shop.id);
  const lines = shopRows(shop.id, shop.timezone, from, to)
    .map((r): IncomeLine => {
      const basePrice = feeBase(r.amount, r.price);
      const isReferred = referred.has(r.bookingCode);
      const referralFee = isReferred ? feeOf(basePrice, bps) : 0;
      return { id: r.id, bookingCode: r.bookingCode, occurredAt: r.occurredAt, kind: r.amount < 0 ? "REVERSAL" : "PAYMENT", currency: r.currency, amount: r.amount, basePrice, maintenanceFee: r.maintenanceFee, serviceFee: r.serviceFee, referralFee, referred: isReferred, profit: r.maintenanceFee + r.serviceFee - referralFee };
    })
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
  const byMonth = new Map<string, MonthStatement>();
  const month = (m: string): MonthStatement => { let x = byMonth.get(m); if (!x) { x = { month: m, payments: 0, income: 0, basePrice: 0, maintenanceFee: 0, serviceFee: 0, fees: 0, referralFee: 0, inviteBonus: 0, profit: 0 }; byMonth.set(m, x); } return x; };
  for (const l of lines) {
    const x = month(monthKey(l.occurredAt, shop.timezone));
    x.payments += 1; x.income += l.amount; x.basePrice += l.basePrice; x.maintenanceFee += l.maintenanceFee; x.serviceFee += l.serviceFee; x.referralFee += l.referralFee;
  }
  for (const b of inviteBonuses().filter((b) => b.shopId === shop.id && (!from || dayKeyOf(b.paidAt, shop.timezone) >= from) && (!to || dayKeyOf(b.paidAt, shop.timezone) <= to))) month(monthKey(b.paidAt, shop.timezone)).inviteBonus += b.amount;
  const months = [...byMonth.values()].map((m) => ({ ...m, fees: m.maintenanceFee + m.serviceFee, profit: m.maintenanceFee + m.serviceFee - m.referralFee - m.inviteBonus })).sort((a, b) => b.month.localeCompare(a.month));
  return { shopId: shop.id, shopName: shop.name, currency: shop.currency, timezone: shop.timezone, lines, months };
}
