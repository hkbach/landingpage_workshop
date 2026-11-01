import { z } from "zod";

// Income and expense ledger of a shop (shop owner area). Money is bigint minor units on the API; plain numbers here, like the other
// UI view models. Booking payments are read-only entries derived from the payment entries (FR-PAY-01); everything else is
// entered by the shop owner.

export const FINANCE_TYPES = ["INCOME", "EXPENSE"] as const;
export type FinanceType = (typeof FINANCE_TYPES)[number];

/** Categories the shop owner can pick. BOOKINGS and REFUNDS only exist as derived entries. */
export const MANUAL_INCOME_CATEGORIES = ["SALES", "OTHER_INCOME"] as const;
export const MANUAL_EXPENSE_CATEGORIES = ["RENT", "MATERIALS", "SALARY", "MARKETING", "UTILITIES", "EQUIPMENT", "OTHER_EXPENSE"] as const;
export const DERIVED_CATEGORIES = ["BOOKINGS", "REFUNDS"] as const;

export const INCOME_CATEGORIES = [...DERIVED_CATEGORIES.slice(0, 1), ...MANUAL_INCOME_CATEGORIES] as const;
export const EXPENSE_CATEGORIES = [...MANUAL_EXPENSE_CATEGORIES, ...DERIVED_CATEGORIES.slice(1)] as const;
export type FinanceCategory = (typeof INCOME_CATEGORIES)[number] | (typeof EXPENSE_CATEGORIES)[number];

export const manualCategories = (type: FinanceType): readonly FinanceCategory[] =>
  type === "INCOME" ? MANUAL_INCOME_CATEGORIES : MANUAL_EXPENSE_CATEGORIES;

export const FINANCE_NOTE_MAX = 200;
export const FINANCE_AMOUNT_MAX = 1_000_000_000_000; // minor units, far above any shop

export interface FinanceEntry {
  id: string;
  type: FinanceType;
  category: FinanceCategory;
  /** Minor units, always positive; the type says the direction. */
  amount: number;
  currency: string;
  /**
   * ISO UTC. Entered as a business date, so it is stored at 12:00 UTC of that date: the same calendar day in every timezone from
   * UTC-12 to UTC+11.
   */
  occurredAt: string;
  note?: string;
  source: "BOOKING" | "MANUAL";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isRealDate(d: string): boolean {
  if (!DATE_RE.test(d)) return false;
  const t = new Date(`${d}T12:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().startsWith(d);
}
export const dateToOccurredAt = (d: string) => `${d}T12:00:00.000Z`;

/** Body of POST/PUT /finance/entries (manual entries). Error messages are codes the UI turns into text. */
export const financeEntrySchema = z
  .object({
    type: z.enum(FINANCE_TYPES, { error: "required" }),
    category: z.string({ error: "required" }).min(1, "required"),
    amount: z.number({ error: "amountInvalid" }).int("amountInvalid").positive("amountInvalid").max(FINANCE_AMOUNT_MAX, "amountTooLarge"),
    date: z.string({ error: "dateInvalid" }).refine(isRealDate, "dateInvalid"),
    note: z.string().trim().max(FINANCE_NOTE_MAX, "noteTooLong").optional(),
  })
  .superRefine((v, ctx) => {
    if (!(manualCategories(v.type) as readonly string[]).includes(v.category)) ctx.addIssue({ code: "custom", path: ["category"], message: "categoryMismatch" });
  });
export type FinanceEntryInput = z.infer<typeof financeEntrySchema>;

// ---- derived entries -----------------------------------------------------------------------------------------------------

export interface PaymentSource {
  id: string; bookingCode: string; currency: string;
  payments: { id: string; type: "PAYMENT" | "REFUND"; amount: number; recordedAt: string }[];
}

/** Payments received are income from bookings, refunds are an expense. Never edited here: they follow the booking. */
export function entriesFromPayments(bookings: readonly PaymentSource[]): FinanceEntry[] {
  return bookings.flatMap((b) =>
    b.payments.map((p): FinanceEntry => ({
      id: `pay-${p.id}`, type: p.type === "PAYMENT" ? "INCOME" : "EXPENSE", category: p.type === "PAYMENT" ? "BOOKINGS" : "REFUNDS",
      amount: p.amount, currency: b.currency, occurredAt: p.recordedAt, note: b.bookingCode, source: "BOOKING",
    })),
  );
}

// ---- reporting -----------------------------------------------------------------------------------------------------------

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

export interface Totals { income: number; expense: number; net: number }
export function summarize(entries: readonly FinanceEntry[]): Totals {
  let income = 0, expense = 0;
  for (const e of entries) { if (e.type === "INCOME") income += e.amount; else expense += e.amount; }
  return { income, expense, net: income - expense };
}

export interface MonthPoint extends Totals { key: string }
/** One point per month key (zero when nothing happened), so the chart always shows every month of the period. */
export function monthlySeries(entries: readonly FinanceEntry[], timeZone: string, keys: readonly string[]): MonthPoint[] {
  const by = new Map<string, FinanceEntry[]>(keys.map((k) => [k, []]));
  for (const e of entries) by.get(monthKey(e.occurredAt, timeZone))?.push(e);
  return keys.map((key) => ({ key, ...summarize(by.get(key) ?? []) }));
}

export interface CategoryShare { category: FinanceCategory; amount: number; share: number }
/** Totals per category of one type, biggest first. `share` is 0..1 of that type's total. */
export function byCategory(entries: readonly FinanceEntry[], type: FinanceType): CategoryShare[] {
  const sums = new Map<FinanceCategory, number>();
  for (const e of entries) if (e.type === type) sums.set(e.category, (sums.get(e.category) ?? 0) + e.amount);
  const total = [...sums.values()].reduce((a, b) => a + b, 0);
  return [...sums.entries()]
    .map(([category, amount]) => ({ category, amount, share: total ? amount / total : 0 }))
    .sort((a, b) => b.amount - a.amount || a.category.localeCompare(b.category));
}

export interface FinanceFilter { months: readonly string[]; type?: FinanceType; category?: FinanceCategory }
export function filterEntries(entries: readonly FinanceEntry[], f: FinanceFilter, timeZone: string): FinanceEntry[] {
  const set = new Set(f.months);
  return entries
    .filter((e) => set.has(monthKey(e.occurredAt, timeZone)) && (!f.type || e.type === f.type) && (!f.category || e.category === f.category))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id));
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
