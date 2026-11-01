import { z } from "zod";
import { LOCALES, type Locale } from "./enums";
import type { Localized } from "./localized";
import { isPlatformMediaPath } from "./media";

// Promotions of a shop (Promotion management, shop owner area). A promotion gives a percentage or a fixed amount off the price of
// all workshops or of selected ones, between two business dates. The landing page "Promotions" section shows the ones that are
// active today. The price a guest pays is always computed by the backend; this file only holds the rules both sides share.

export const DISCOUNT_TYPES = ["PERCENT", "FIXED_AMOUNT"] as const;
export type DiscountType = (typeof DISCOUNT_TYPES)[number];

export const PROMOTION_STATUSES = ["ACTIVE", "SCHEDULED", "EXPIRED", "PAUSED"] as const;
export type PromotionStatus = (typeof PROMOTION_STATUSES)[number];

export const MAX_PROMOTIONS_PER_SHOP = 20;
/** At any moment (today or any later day) at most this many enabled promotions may run at the same time. */
export const MAX_CONCURRENT_PROMOTIONS = 5;

/**
 * How a guest may use promotions on one booking, chosen by the shop owner:
 * SINGLE = at most one promotion per booking; MULTIPLE = any number of eligible promotions on one booking.
 */
export const STACKING_MODES = ["SINGLE", "MULTIPLE"] as const;
export type StackingMode = (typeof STACKING_MODES)[number];
export const DEFAULT_STACKING: StackingMode = "SINGLE";
export const PROMOTION_TITLE_MAX = 80;
export const PROMOTION_DESCRIPTION_MAX = 300;
export const PROMOTION_CODE_RE = /^[A-Z0-9]{3,20}$/;
const FIXED_AMOUNT_MAX = 1_000_000_000_000; // minor units

export interface PromotionRecord {
  id: string;
  title: Localized;
  description: Localized;
  discountType: DiscountType;
  /** PERCENT: 1..100. FIXED_AMOUNT: minor units of the shop currency. */
  discountValue: number;
  /** Optional code the guest mentions at the shop (bookings are paid on site). */
  code?: string;
  /** One optional image: an https URL or a platform media path (see media.ts). */
  imageUrl?: string;
  /** "ALL" = every workshop, otherwise only the listed ones. */
  appliesTo: "ALL" | "SELECTED";
  workshopIds: string[];
  /** Business dates (shop timezone), both days included. */
  startDate: string;
  endDate: string;
  /** The shop owner can pause a promotion without losing it. */
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

const isHttpsUrl = (v: string) => { try { return new URL(v).protocol === "https:"; } catch { return false; } };
const isRealDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && new Date(`${d}T12:00:00Z`).toISOString().startsWith(d);

const localizedText = (max: number) =>
  z.object(Object.fromEntries(LOCALES.map((l) => [l, z.string().max(max, "tooLong").optional()])) as Record<Locale, z.ZodOptional<z.ZodString>>);

/** Body of POST / PUT /promotions. Messages are codes the UI turns into text. */
export const promotionInputSchema = z
  .object({
    title: localizedText(PROMOTION_TITLE_MAX),
    description: localizedText(PROMOTION_DESCRIPTION_MAX),
    discountType: z.enum(DISCOUNT_TYPES, { error: "required" }),
    discountValue: z.number({ error: "valueInvalid" }).int("valueInvalid").positive("valueInvalid").max(FIXED_AMOUNT_MAX, "valueInvalid"),
    imageUrl: z.string().max(500, "imageInvalid").refine((v) => v === "" || isHttpsUrl(v) || isPlatformMediaPath(v), "imageInvalid").optional(),
    code: z.string().trim().toUpperCase().refine((c) => c === "" || PROMOTION_CODE_RE.test(c), "codeInvalid").optional(),
    appliesTo: z.enum(["ALL", "SELECTED"], { error: "required" }),
    workshopIds: z.array(z.string().min(1)).max(100),
    startDate: z.string({ error: "dateInvalid" }).refine(isRealDate, "dateInvalid"),
    endDate: z.string({ error: "dateInvalid" }).refine(isRealDate, "dateInvalid"),
    enabled: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (!Object.values(v.title).some((s) => s?.trim())) ctx.addIssue({ code: "custom", path: ["title"], message: "titleRequired" });
    if (v.discountType === "PERCENT" && v.discountValue > 100) ctx.addIssue({ code: "custom", path: ["discountValue"], message: "percentTooHigh" });
    if (v.appliesTo === "SELECTED" && v.workshopIds.length === 0) ctx.addIssue({ code: "custom", path: ["workshopIds"], message: "workshopRequired" });
    if (isRealDate(v.startDate) && isRealDate(v.endDate) && v.endDate < v.startDate) ctx.addIssue({ code: "custom", path: ["endDate"], message: "endBeforeStart" });
  });
export type PromotionInput = z.infer<typeof promotionInputSchema>;

/** Status on a given local day ("YYYY-MM-DD" in the shop timezone). A paused promotion stays paused whatever the dates. */
export function promotionStatus(p: Pick<PromotionRecord, "enabled" | "startDate" | "endDate">, today: string): PromotionStatus {
  if (!p.enabled) return "PAUSED";
  if (today < p.startDate) return "SCHEDULED";
  if (today > p.endDate) return "EXPIRED";
  return "ACTIVE";
}

/** The promotions guests see: active today, newest start first. */
export function activePromotions<T extends Pick<PromotionRecord, "enabled" | "startDate" | "endDate">>(list: readonly T[], today: string): T[] {
  return list.filter((p) => promotionStatus(p, today) === "ACTIVE").sort((a, b) => b.startDate.localeCompare(a.startDate));
}

export const promotionAppliesTo = (p: Pick<PromotionRecord, "appliesTo" | "workshopIds">, workshopId: string) =>
  p.appliesTo === "ALL" || p.workshopIds.includes(workshopId);

/** Amount taken off one price, in minor units: never more than the price, never below 0. */
export function discountAmount(price: number, p: Pick<PromotionRecord, "discountType" | "discountValue">): number {
  if (!(price > 0)) return 0;
  const raw = p.discountType === "PERCENT" ? Math.round((price * p.discountValue) / 100) : p.discountValue;
  return Math.min(price, Math.max(0, raw));
}
export const discountedPrice = (price: number, p: Pick<PromotionRecord, "discountType" | "discountValue">) => price - discountAmount(price, p);

/** Counts for the management page summary. */
export function countByStatus(list: readonly Pick<PromotionRecord, "enabled" | "startDate" | "endDate">[], today: string): Record<PromotionStatus | "total", number> {
  const out = { ACTIVE: 0, SCHEDULED: 0, EXPIRED: 0, PAUSED: 0, total: list.length };
  for (const p of list) out[promotionStatus(p, today)] += 1;
  return out;
}

/** The promotions a guest can pick for one workshop: active today and covering that workshop. */
export function eligiblePromotions<T extends Pick<PromotionRecord, "enabled" | "startDate" | "endDate" | "appliesTo" | "workshopIds">>(
  list: readonly T[], workshopId: string, today: string,
): T[] {
  return activePromotions(list, today).filter((p) => promotionAppliesTo(p, workshopId));
}

/**
 * The first day, from `today` on, when more than `max` enabled promotions would run at once; null when there is none.
 * Paused promotions and days in the past do not count. The load only goes up on a start date, so checking those days is enough.
 */
export function firstOverloadedDay(
  list: readonly Pick<PromotionRecord, "enabled" | "startDate" | "endDate">[], today: string, max = MAX_CONCURRENT_PROMOTIONS,
): string | null {
  const live = list.filter((p) => p.enabled && p.endDate >= today);
  const days = [...new Set(live.map((p) => (p.startDate < today ? today : p.startDate)))].sort();
  for (const d of days) if (live.filter((p) => p.startDate <= d && d <= p.endDate).length > max) return d;
  return null;
}

export interface PriceLine { id: string; amount: number }
export type BookingPrice =
  | { ok: true; subtotal: number; discounts: PriceLine[]; discount: number; total: number }
  | { ok: false; error: "SINGLE_ONLY" };

/**
 * Price of one booking with the promotions a guest chose (the backend runs this too and never trusts the client's total).
 * The subtotal is unit price x quantity. Fixed amounts come off the booking first, then each percentage is taken off what is
 * left, so the result does not depend on the order the guest clicked. No discount is larger than what is left, so the total
 * is never below 0. With SINGLE stacking, more than one promotion is refused.
 */
export function priceBooking(input: {
  unitPrice: number; quantity: number; stacking: StackingMode;
  promotions: readonly Pick<PromotionRecord, "id" | "discountType" | "discountValue">[];
}): BookingPrice {
  if (input.stacking === "SINGLE" && input.promotions.length > 1) return { ok: false, error: "SINGLE_ONLY" };
  const subtotal = Math.max(0, input.unitPrice) * Math.max(0, input.quantity);
  const ordered = [...input.promotions].sort((a, b) => (a.discountType === b.discountType ? 0 : a.discountType === "FIXED_AMOUNT" ? -1 : 1));
  let left = subtotal;
  const discounts: PriceLine[] = [];
  for (const p of ordered) {
    const amount = discountAmount(left, p);
    discounts.push({ id: p.id, amount });
    left -= amount;
  }
  return { ok: true, subtotal, discounts, discount: subtotal - left, total: left };
}
