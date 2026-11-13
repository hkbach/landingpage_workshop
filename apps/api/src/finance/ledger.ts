import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { checkDateRange, dayKeyOf, feeBase, feeOf, isDayKey, ledgerFromPayments, monthKey, type BookingPriceInfo, type LedgerRow } from "@workshop/shared";
import { referralBonuses } from "../affiliate/earnings";
import { addDays, dateIn, zonedToUtc } from "../common/zoned-time";
import type { Executor } from "../db/db.module";
import { bookings, financeMonthClosings, organizationFeeRates, organizations, payments } from "../db/schema";
import { tenantScope } from "../tenant/tenant-scope";
import { DEFAULT_RATES, type Rates } from "./rates";

export { DEFAULT_RATES, type Rates };

// The ledger of a shop (FR-PAY-02): every payment and reversal of a booking that is PAID, with the fees taken from it. The rule of the fees lives in `packages/shared` (the web app uses the
// same one), this file reads the rows from the database and puts the right rates on each: the rates of a month that was closed are the ones written when it was closed, the rates of an
// open month are the current ones.

export interface ShopInfo { id: string; name: string; slug: string; timezone: string; currency: string }

/** One payment or reversal with what is needed to take the fees from it. */
export interface Entry {
  organizationId: string;
  paymentId: string;
  bookingCode: string;
  currency: string;
  type: "PAYMENT" | "REVERSAL";
  amount: number;
  recordedAt: Date;
  /** The moment whose rates apply (D24): when the payment was recorded; for a reversal, when the payment it reverses was recorded (so the two cancel out exactly). */
  rateAt: Date;
  price: BookingPriceInfo;
  /** The booking came through an affiliate link: the platform pays the Affiliate fee on it. */
  affiliate: boolean;
  /** The booking is the one that earns a friend's Referral bonus (the first paid one after registering). */
  referral: boolean;
}

const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });

/** The first instant of a day in the time zone of a shop (a day that has no midnight there starts an hour later). */
export const startOfDay = (date: string, timeZone: string): Date => zonedToUtc(date, "00:00", timeZone) ?? zonedToUtc(date, "01:00", timeZone) ?? new Date(`${date}T00:00:00Z`);

/** Longest default range of a screen: the last 180 days, both ends included, in the time zone of the shop. */
export const DEFAULT_RANGE_DAYS = 180;

/** A range typed by the user, or the default one when neither end is given. A wrong one is a 422 with the field that is wrong. */
export function resolveRange(from: string | undefined, to: string | undefined, timeZone: string, now: Date): { from: string; to: string } {
  if (from === undefined && to === undefined) {
    const today = dateIn(now, timeZone);
    return { from: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), to: today };
  }
  const result = checkDateRange(from ?? "", to ?? "");
  if (result === "OK") return { from: from!, to: to! };
  if (result === "REQUIRED") throw invalid(from ? { to: "required" } : { from: "required" });
  if (result === "INVALID") throw invalid({ [isDayKey(from ?? "") ? "to" : "from"]: "invalid" });
  throw invalid({ to: result === "ORDER" ? "beforeFrom" : "tooLong" });
}

/** The payments and reversals recorded in [fromUtc, toUtc) on bookings that are PAID. One shop (always filtered by its id) or, for the platform administrator, every shop. */
export async function loadEntries(executor: Executor, filter: { organizationId?: string; fromUtc: Date; toUtc: Date }): Promise<Entry[]> {
  const rows = await executor
    .select({
      organizationId: payments.organizationId, paymentId: payments.id, bookingCode: bookings.bookingCode, currency: payments.currency, type: payments.type, amount: payments.amount, recordedAt: payments.recordedAt,
      quantity: bookings.quantity, unitPrice: bookings.unitPriceAmount, discountAmount: bookings.discountAmount, snapshot: bookings.snapshot, bookingId: bookings.id, affiliateLinkId: bookings.affiliateLinkId,
      rateAtMs: sql<string | null>`(extract(epoch from case when ${payments.type} = 'PAYMENT' then ${payments.recordedAt} else (select max(p2.recorded_at) from payments p2 where p2.organization_id = ${payments.organizationId} and p2.booking_id = ${payments.bookingId} and p2.type = 'PAYMENT' and p2.recorded_at <= ${payments.recordedAt}) end) * 1000)::bigint`,
    })
    .from(payments)
    .innerJoin(bookings, and(eq(bookings.organizationId, payments.organizationId), eq(bookings.id, payments.bookingId)))
    .where(and(filter.organizationId ? tenantScope(payments, filter.organizationId) : undefined, eq(bookings.paymentStatus, "PAID"), gte(payments.recordedAt, filter.fromUtc), lt(payments.recordedAt, filter.toUtc)));
  const bonusBookings = new Set((await referralBonuses(executor, filter.organizationId ? { organizationId: filter.organizationId } : {})).map((b) => b.bookingId));
  return rows.map((r) => {
    // The original price (before the vouchers) and what each voucher took off, as they were when the booking was made (BR-05).
    const subtotal = r.snapshot.subtotalAmount ?? r.unitPrice * r.quantity;
    const discounts = r.snapshot.discounts ?? (r.discountAmount > 0 ? [{ code: "DISCOUNT", amount: r.discountAmount }] : []);
    return { organizationId: r.organizationId, paymentId: r.paymentId, bookingCode: r.bookingCode, currency: r.currency, type: r.type, amount: r.amount, recordedAt: r.recordedAt, rateAt: r.rateAtMs === null ? r.recordedAt : new Date(Number(r.rateAtMs)), price: { subtotal, discounts }, affiliate: r.affiliateLinkId !== null, referral: bonusBookings.has(r.bookingId) };
  });
}

/**
 * The rates of every shop over time (D24): a fee is worked out with the rates that were in force at the moment of the payment, so a change of the rates only reaches what happens after it
 * and what was worked out before never changes. A shop with no history has the defaults.
 */
export class RatesBook {
  private constructor(private readonly history: Map<string, { from: number; rates: Rates }[]>, private readonly closed: Set<string>) {}

  static async load(executor: Executor, organizationIds?: readonly string[]): Promise<RatesBook> {
    const versions = await executor.select().from(organizationFeeRates).where(organizationIds ? inArray(organizationFeeRates.organizationId, [...organizationIds]) : undefined).orderBy(asc(organizationFeeRates.effectiveFrom));
    const closings = await executor.select({ organizationId: financeMonthClosings.organizationId, month: financeMonthClosings.month }).from(financeMonthClosings).where(organizationIds ? inArray(financeMonthClosings.organizationId, [...organizationIds]) : undefined);
    const history = new Map<string, { from: number; rates: Rates }[]>();
    for (const v of versions) {
      const list = history.get(v.organizationId) ?? [];
      list.push({ from: v.effectiveFrom.getTime(), rates: { maintenanceBps: v.maintenanceBps, serviceBps: v.serviceBps, affiliateBps: v.affiliateBps, inviteBonusBps: v.inviteBonusBps } });
      history.set(v.organizationId, list);
    }
    return new RatesBook(history, new Set(closings.map((c) => `${c.organizationId}|${c.month}`)));
  }

  /** The rates in force at a moment: the last version that began at or before it, or the defaults when none had begun. */
  ratesAt(organizationId: string, at: Date): Rates {
    const list = this.history.get(organizationId) ?? [];
    for (let i = list.length - 1; i >= 0; i--) if (list[i]!.from <= at.getTime()) return list[i]!.rates;
    return DEFAULT_RATES;
  }
  /** The rates a payment made now would be worked out with. */
  currentOf(organizationId: string): Rates {
    const list = this.history.get(organizationId) ?? [];
    return list.length > 0 ? list[list.length - 1]!.rates : DEFAULT_RATES;
  }
  isClosed(organizationId: string, month: string): boolean {
    return this.closed.has(`${organizationId}|${month}`);
  }
}

/** A ledger row with what the PLATFORM pays out of its fees on that payment (the shop never sees these two). Negative for a reversal, like the rest. */
export type PlatformLedgerRow = LedgerRow & { affiliateFee: number; referralBonus: number };

/** The ledger rows of the entries of ONE shop, newest first (a payment is positive, a reversal negative). */
export function buildLedger(entries: readonly Entry[], shop: Pick<ShopInfo, "timezone">, book: RatesBook): PlatformLedgerRow[] {
  return entries
    .map((e): PlatformLedgerRow => {
      const iso = e.recordedAt.toISOString();
      const rates = book.ratesAt(e.organizationId, e.rateAt); // the rates of the moment of the payment, never today's
      const [row] = ledgerFromPayments(
        [{ id: e.paymentId, bookingCode: e.bookingCode, currency: e.currency, price: e.price, payments: [{ id: e.paymentId, type: e.type === "PAYMENT" ? "PAYMENT" : "REFUND", amount: e.amount, recordedAt: iso }] }],
        rates,
      );
      const base = feeBase(row!.amount, row!.price); // the same base as the maintenance and the service fee: the ORIGINAL price
      return { ...row!, affiliateFee: e.affiliate ? feeOf(base, rates.affiliateBps) : 0, referralBonus: e.referral ? feeOf(base, rates.inviteBonusBps) : 0 };
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
}

/** The rows paid on the days from `from` to `to` (the days of the time zone), keeping whatever else a row carries. */
export const rowsInRange = <T extends LedgerRow>(rows: readonly T[], from: string, to: string, timeZone: string): T[] => rows.filter((r) => { const d = dayKeyOf(r.occurredAt, timeZone); return d >= from && d <= to; });

/** The ledger row as the API shows it: a reversal is named REVERSAL (never "refund": the system does not give money back, REQUIREMENTS 8.5) and the id is the payment's. */
export function ledgerView(row: LedgerRow | PlatformLedgerRow, timeZone: string, forPlatform = false) {
  return {
    id: row.id.replace(/^pay-/, ""), bookingCode: row.bookingCode, kind: row.kind === "PAYMENT" ? ("PAYMENT" as const) : ("REVERSAL" as const), currency: row.currency, occurredAt: row.occurredAt, day: dayKeyOf(row.occurredAt, timeZone),
    amount: row.amount, originalPrice: row.price.subtotal, promotions: row.price.discounts, maintenanceFee: row.maintenanceFee, serviceFee: row.serviceFee, profit: row.profit,
    // what the platform pays out of its fees: only for the administrator, never for the shop
    ...(forPlatform && "affiliateFee" in row ? { affiliateFee: row.affiliateFee, referralBonus: row.referralBonus } : {}),
  };
}

/**
 * D10: a payment of a month that was closed can no longer be put back to unpaid (the month is final). `instants` are the moments the payments were recorded.
 * The month is the one of the shop's time zone.
 */
export async function assertMonthsOpen(executor: Executor, organizationId: string, instants: readonly Date[]): Promise<void> {
  if (instants.length === 0) return;
  const [shop] = await executor.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
  if (!shop) return;
  const months = [...new Set(instants.map((d) => monthKey(d.toISOString(), shop.timezone)))];
  const closed = await executor.select({ month: financeMonthClosings.month }).from(financeMonthClosings).where(and(tenantScope(financeMonthClosings, organizationId), inArray(financeMonthClosings.month, months)));
  if (closed.length > 0) throw new ConflictException({ code: "MONTH_CLOSED", message: "The month of this payment is closed: it can no longer be changed.", details: { month: closed.map((c) => c.month).sort()[0] } });
}
