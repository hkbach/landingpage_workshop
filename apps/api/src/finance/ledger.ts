import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { DEFAULT_FEE_RATES, checkDateRange, dayKeyOf, isDayKey, ledgerFromPayments, monthKey, type BookingPriceInfo, type FeeRates, type LedgerRow } from "@workshop/shared";
import { addDays, dateIn, zonedToUtc } from "../common/zoned-time";
import type { Executor } from "../db/db.module";
import { bookings, financeMonthClosings, organizationFeeSettings, organizations, payments } from "../db/schema";
import { tenantScope } from "../tenant/tenant-scope";

// The ledger of a shop (FR-PAY-02): every payment and reversal of a booking that is PAID, with the fees taken from it. The rule of the fees lives in `packages/shared` (the web app uses the
// same one), this file reads the rows from the database and puts the right rates on each: the rates of a month that was closed are the ones written when it was closed, the rates of an
// open month are the current ones.

export interface Rates extends FeeRates { affiliateBps: number; inviteBonusBps: number }
/** Until an administrator sets the rates of a shop (a round value to start with; the real percentages are a business decision). */
export const DEFAULT_RATES: Rates = { ...DEFAULT_FEE_RATES, affiliateBps: 1000, inviteBonusBps: 1000 };

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
  price: BookingPriceInfo;
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
      quantity: bookings.quantity, unitPrice: bookings.unitPriceAmount, discountAmount: bookings.discountAmount, snapshot: bookings.snapshot,
    })
    .from(payments)
    .innerJoin(bookings, and(eq(bookings.organizationId, payments.organizationId), eq(bookings.id, payments.bookingId)))
    .where(and(filter.organizationId ? tenantScope(payments, filter.organizationId) : undefined, eq(bookings.paymentStatus, "PAID"), gte(payments.recordedAt, filter.fromUtc), lt(payments.recordedAt, filter.toUtc)));
  return rows.map((r) => {
    // The original price (before the vouchers) and what each voucher took off, as they were when the booking was made (BR-05).
    const subtotal = r.snapshot.subtotalAmount ?? r.unitPrice * r.quantity;
    const discounts = r.snapshot.discounts ?? (r.discountAmount > 0 ? [{ code: "DISCOUNT", amount: r.discountAmount }] : []);
    return { organizationId: r.organizationId, paymentId: r.paymentId, bookingCode: r.bookingCode, currency: r.currency, type: r.type, amount: r.amount, recordedAt: r.recordedAt, price: { subtotal, discounts } };
  });
}

/** The rates in force: the closed months keep theirs, every other month uses what the shop has now. */
export class RatesBook {
  private constructor(private readonly current: Map<string, Rates>, private readonly closed: Map<string, FeeRates>) {}

  static async load(executor: Executor, organizationIds?: readonly string[]): Promise<RatesBook> {
    const settings = await executor.select().from(organizationFeeSettings).where(organizationIds ? inArray(organizationFeeSettings.organizationId, [...organizationIds]) : undefined);
    const closings = await executor.select({ organizationId: financeMonthClosings.organizationId, month: financeMonthClosings.month, maintenanceBps: financeMonthClosings.maintenanceBps, serviceBps: financeMonthClosings.serviceBps })
      .from(financeMonthClosings).where(organizationIds ? inArray(financeMonthClosings.organizationId, [...organizationIds]) : undefined);
    return new RatesBook(
      new Map(settings.map((s) => [s.organizationId, { maintenanceBps: s.maintenanceBps, serviceBps: s.serviceBps, affiliateBps: s.affiliateBps, inviteBonusBps: s.inviteBonusBps }])),
      new Map(closings.map((c) => [`${c.organizationId}|${c.month}`, { maintenanceBps: c.maintenanceBps, serviceBps: c.serviceBps }])),
    );
  }

  currentOf(organizationId: string): Rates {
    return this.current.get(organizationId) ?? DEFAULT_RATES;
  }
  isClosed(organizationId: string, month: string): boolean {
    return this.closed.has(`${organizationId}|${month}`);
  }
  ratesFor(organizationId: string, month: string): FeeRates {
    return this.closed.get(`${organizationId}|${month}`) ?? this.currentOf(organizationId);
  }
}

/** The ledger rows of the entries of ONE shop, newest first (a payment is positive, a reversal negative). */
export function buildLedger(entries: readonly Entry[], shop: Pick<ShopInfo, "timezone">, book: RatesBook): LedgerRow[] {
  return entries
    .map((e) => {
      const iso = e.recordedAt.toISOString();
      const [row] = ledgerFromPayments(
        [{ id: e.paymentId, bookingCode: e.bookingCode, currency: e.currency, price: e.price, payments: [{ id: e.paymentId, type: e.type === "PAYMENT" ? "PAYMENT" : "REFUND", amount: e.amount, recordedAt: iso }] }],
        book.ratesFor(e.organizationId, monthKey(iso, shop.timezone)),
      );
      return row!;
    })
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt) || a.id.localeCompare(b.id));
}

/** The ledger row as the API shows it: a reversal is named REVERSAL (never "refund": the system does not give money back, REQUIREMENTS 8.5) and the id is the payment's. */
export function ledgerView(row: LedgerRow, timeZone: string) {
  return {
    id: row.id.replace(/^pay-/, ""), bookingCode: row.bookingCode, kind: row.kind === "PAYMENT" ? ("PAYMENT" as const) : ("REVERSAL" as const), currency: row.currency, occurredAt: row.occurredAt, day: dayKeyOf(row.occurredAt, timeZone),
    amount: row.amount, originalPrice: row.price.subtotal, promotions: row.price.discounts, maintenanceFee: row.maintenanceFee, serviceFee: row.serviceFee, profit: row.profit,
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
