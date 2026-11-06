// SERVER-ONLY: the income of the PLATFORM (the Income page of the system admin), until apps/api exists. It is made of the fees charged on the bookings of the shops
// (maintenance + service, each shop with its own rates) minus the referral fees paid to the people whose links brought the bookings:
//   profit of the platform = total fees - referral fees.
// The referral fee of a booking that came through a link is the shop's referral rate (a part of the platform fees taken on that booking).
import { dayKeyOf, feeOf, isDayKey, ledgerFromPayments, type LedgerRow } from "@workshop/shared";
import { liveBookings } from "./booking-store";
import { currentShop } from "./data";
import { getFeeRates, getReferralBps } from "./fee-rates-store";
import { paymentSources } from "./ledger-source";
import { attributedBookings, listReferrals } from "./referral-store";
import { liveShops } from "./shop-admin-store";

export interface ShopIncome {
  shopId: string; shopName: string; currency: string;
  /** The payments received on the bookings of the shop, less the refunds. */
  income: number;
  maintenanceFee: number; serviceFee: number;
  /** maintenanceFee + serviceFee: what the platform charged the shop. */
  fees: number;
  /** What the platform pays for the bookings that came through referral links. */
  referralFee: number;
  /** fees - referralFee. */
  profit: number;
  bookings: number;
}

export interface Income {
  from: string | null; to: string | null;
  shops: ShopIncome[];
  /** The totals, one per currency (amounts of different currencies are never added together). */
  totals: { currency: string; income: number; fees: number; referralFee: number; profit: number }[];
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
  const shops = liveShops().map((s): ShopIncome => {
    const rows = shopRows(s.id, s.timezone, from, to);
    const referralBps = getReferralBps(s.id);
    let income = 0, maintenanceFee = 0, serviceFee = 0, referralFee = 0;
    for (const r of rows) {
      income += r.amount; maintenanceFee += r.maintenanceFee; serviceFee += r.serviceFee;
      if (referred.has(r.bookingCode)) referralFee += feeOf(r.maintenanceFee + r.serviceFee, referralBps);
    }
    const fees = maintenanceFee + serviceFee;
    return { shopId: s.id, shopName: s.name, currency: s.currency, income, maintenanceFee, serviceFee, fees, referralFee, profit: fees - referralFee, bookings: new Set(rows.map((r) => r.bookingCode)).size };
  });
  const totals = [...new Set(shops.map((s) => s.currency))].map((currency) => {
    const mine = shops.filter((s) => s.currency === currency);
    const sum = (k: "income" | "fees" | "referralFee" | "profit") => mine.reduce((n, s) => n + s[k], 0);
    return { currency, income: sum("income"), fees: sum("fees"), referralFee: sum("referralFee"), profit: sum("profit") };
  });
  return { from: from ?? null, to: to ?? null, shops, totals };
}

/** What each referral link earned (the fee the platform pays the person who shared it) and the bookings it brought, in the same days. */
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
      e.fee += feeOf(r.maintenanceFee + r.serviceFee, bps);
      out.set(link, e);
    }
  }
  for (const r of listReferrals()) if (!out.has(r.id)) out.set(r.id, { bookings: 0, fee: 0 });
  return out;
}
