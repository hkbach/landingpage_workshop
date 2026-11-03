// Income of a shop (shop owner area). Money is bigint minor units on the API; plain numbers here, like the other UI view models.
//
// Profit = total income - maintenance fee - service fee
//  - Total income: the payments received on the bookings minus the refunds (FR-PAY-01).
//  - Maintenance fee: a percentage of every booking, set by the platform administrator.
//  - Service fee: a percentage, set by the platform administrator, of the same income.
// The rates are kept in basis points (1% = 100) so no amount is ever computed with a fractional percent.

export interface PaymentSource {
  id: string; bookingCode: string; currency: string;
  payments: { id: string; type: "PAYMENT" | "REFUND"; amount: number; recordedAt: string }[];
}

// ---- fee rates ---------------------------------------------------------------------------------------------------------------

export interface FeeRates { maintenanceBps: number; serviceBps: number }
export const MAX_FEE_BPS = 10_000; // 100%
/** The rates until an administrator sets them (mock data): 2% maintenance, 3% service. */
export const DEFAULT_FEE_RATES: FeeRates = { maintenanceBps: 200, serviceBps: 300 };

export const isValidFeeBps = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_FEE_BPS;

/** Both rates are whole basis points from 0 to 100%, and together they cannot take more than the whole income. */
export function checkFeeRates(r: { maintenanceBps: unknown; serviceBps: unknown }): "OK" | "MAINTENANCE_INVALID" | "SERVICE_INVALID" | "TOTAL_TOO_HIGH" {
  if (!isValidFeeBps(r.maintenanceBps)) return "MAINTENANCE_INVALID";
  if (!isValidFeeBps(r.serviceBps)) return "SERVICE_INVALID";
  return r.maintenanceBps + r.serviceBps > MAX_FEE_BPS ? "TOTAL_TOO_HIGH" : "OK";
}

/** A percentage typed by a person ("2", "2.5", "2,5") to basis points; null when it is not a number from 0 to 100 with at most 2 decimals. */
export function percentToBps(text: string): number | null {
  const s = text.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) return null;
  const bps = Math.round(Number(s) * 100);
  return bps <= MAX_FEE_BPS ? bps : null;
}

/** Basis points as the text of a percentage to edit ("2", "2.5", "0.25"). */
export const bpsToPercent = (bps: number): string => String(bps / 100);

/** The fee on an amount (negative for a refund, so a refund gives its fee back), rounded to the minor unit. */
export const feeOf = (amount: number, bps: number): number => Math.sign(amount) * Math.round((Math.abs(amount) * bps) / MAX_FEE_BPS);

// ---- ledger ------------------------------------------------------------------------------------------------------------------

/** One payment or refund of a booking with the fees taken from it. `amount` is signed: a refund is negative. */
export interface LedgerRow {
  id: string; bookingCode: string; kind: "PAYMENT" | "REFUND"; currency: string;
  /** ISO UTC instant the payment was recorded. */
  occurredAt: string;
  amount: number; maintenanceFee: number; serviceFee: number;
  /** amount - maintenanceFee - serviceFee. */
  profit: number;
}

export function ledgerFromPayments(bookings: readonly PaymentSource[], rates: FeeRates): LedgerRow[] {
  return bookings.flatMap((b) =>
    b.payments.map((p): LedgerRow => {
      const amount = p.type === "PAYMENT" ? p.amount : -p.amount;
      const maintenanceFee = feeOf(amount, rates.maintenanceBps);
      const serviceFee = feeOf(amount, rates.serviceBps);
      return { id: `pay-${p.id}`, bookingCode: b.bookingCode, kind: p.type, currency: b.currency, occurredAt: p.recordedAt, amount, maintenanceFee, serviceFee, profit: amount - maintenanceFee - serviceFee };
    }),
  );
}

// ---- reporting ---------------------------------------------------------------------------------------------------------------

/** "YYYY-MM" of an instant in the shop timezone. */
export function monthKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date(iso)).slice(0, 7);
}

/** The `count` month keys ending with the month of `now`, oldest first. */
export function lastMonthKeys(now: Date, timeZone: string, count: number): string[] {
  const [y, m] = monthKey(now.toISOString(), timeZone).split("-").map(Number) as [number, number];
  return Array.from({ length: count }, (_, i) => {
    const idx = y * 12 + (m - 1) - (count - 1 - i);
    return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
  });
}

export interface LedgerTotals { income: number; maintenanceFee: number; serviceFee: number; fees: number; profit: number }
export function summarizeLedger(rows: readonly LedgerRow[]): LedgerTotals {
  let income = 0, maintenanceFee = 0, serviceFee = 0;
  for (const r of rows) { income += r.amount; maintenanceFee += r.maintenanceFee; serviceFee += r.serviceFee; }
  return { income, maintenanceFee, serviceFee, fees: maintenanceFee + serviceFee, profit: income - maintenanceFee - serviceFee };
}

/** The rows of the given months (shop timezone), newest first. */
export function filterLedger(rows: readonly LedgerRow[], months: readonly string[], timeZone: string, kind?: LedgerRow["kind"]): LedgerRow[] {
  const set = new Set(months);
  return rows
    .filter((r) => set.has(monthKey(r.occurredAt, timeZone)) && (!kind || r.kind === kind))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
}

/** One point of the monthly chart: `expense` is the fees and `net` the profit. */
export interface MonthPoint { key: string; income: number; expense: number; net: number }
/** One point per month key (zero when nothing happened), so the chart always shows every month of the period. */
export function monthlyLedger(rows: readonly LedgerRow[], timeZone: string, keys: readonly string[]): MonthPoint[] {
  const by = new Map<string, LedgerRow[]>(keys.map((k) => [k, []]));
  for (const r of rows) by.get(monthKey(r.occurredAt, timeZone))?.push(r);
  return keys.map((key) => { const t = summarizeLedger(by.get(key) ?? []); return { key, income: t.income, expense: t.fees, net: t.profit }; });
}

export type FeeKind = "MAINTENANCE" | "SERVICE";
export interface FeeShare { category: FeeKind; amount: number; share: number }
/** What each fee takes, biggest first; `share` is 0..1 of all the fees. Empty when no fee was taken. */
export function feeShares(t: Pick<LedgerTotals, "maintenanceFee" | "serviceFee" | "fees">): FeeShare[] {
  return ([["MAINTENANCE", t.maintenanceFee], ["SERVICE", t.serviceFee]] as const)
    .filter(([, amount]) => amount !== 0)
    .map(([category, amount]) => ({ category, amount, share: t.fees ? amount / t.fees : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

export interface AxisScale { top: number; bottom: number; step: number }
/**
 * Axis for a chart that holds values from `min` (0 or below) to `max` (0 or above): a round step (1, 2, 5 or 10 times a power of
 * ten) with `top` and `bottom` as whole steps, so every tick is a round number. About four steps are used.
 */
export function niceScale(max: number, min = 0): AxisScale {
  const span = Math.max(max, 0) - Math.min(min, 0);
  if (!(span > 0)) return { top: 4, bottom: 0, step: 1 };
  const raw = span / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  return { top: Math.ceil(Math.max(max, 0) / step) * step, bottom: Math.floor(Math.min(min, 0) / step) * step, step };
}
