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
 * How one promotion may be used on a booking, chosen by the shop owner for each promotion:
 * SINGLE = it must be the only promotion on the booking; MULTIPLE = it can be combined with other promotions that are MULTIPLE too.
 */
export const STACKING_MODES = ["SINGLE", "MULTIPLE"] as const;
export type StackingMode = (typeof STACKING_MODES)[number];
export const DEFAULT_STACKING: StackingMode = "SINGLE";
export const PROMOTION_TITLE_MAX = 80;
export const PROMOTION_DESCRIPTION_MAX = 300;
export const PROMOTION_CODE_RE = /^[A-Za-z0-9]{3,20}$/;
const FIXED_AMOUNT_MAX = 1_000_000_000_000; // minor units

export interface PromotionRecord {
  id: string;
  title: Localized;
  description: Localized;
  discountType: DiscountType;
  /** PERCENT: 1..100. FIXED_AMOUNT: minor units of the shop currency. */
  discountValue: number;
  /** Required code the guest mentions at the shop (bookings are paid on site): 3 to 20 capital letters and digits. */
  code: string;
  /** One optional image: an https URL or a platform media path (see media.ts). */
  imageUrl?: string;
  /** Whether a guest can combine this promotion with others on one booking. */
  stacking: StackingMode;
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
    // Required. Checked as typed (no trimming): a space anywhere, an accent or any special character is refused; the code is kept in capitals.
    code: z.string({ error: "codeRequired" }).min(1, "codeRequired").regex(PROMOTION_CODE_RE, "codeInvalid").transform((c) => c.toUpperCase()),
    stacking: z.enum(STACKING_MODES, { error: "required" }),
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
  | { ok: false; error: "NOT_COMBINABLE" };

/** Whether these promotions may be used together on one booking: one alone always, several only when every one of them allows it. */
export const canCombine = (list: readonly Pick<PromotionRecord, "stacking">[]): boolean => list.length <= 1 || list.every((p) => p.stacking === "MULTIPLE");

/**
 * The promotions that stay chosen after the guest picks `id`: a SINGLE promotion replaces everything else, and a MULTIPLE one
 * replaces a SINGLE one but is added next to other MULTIPLE ones. Picking a promotion that is already chosen removes it.
 */
export function togglePromotion<T extends Pick<PromotionRecord, "id" | "stacking">>(chosen: readonly T[], pick: T): T[] {
  if (chosen.some((p) => p.id === pick.id)) return chosen.filter((p) => p.id !== pick.id);
  if (pick.stacking === "SINGLE") return [pick];
  return [...chosen.filter((p) => p.stacking === "MULTIPLE"), pick];
}

/**
 * The promotions that get unchecked because of the pick itself (not the pick, nor one that was already unchecked), so the guest can be
 * told why: choosing a promotion that must be used alone unchecks all the others, and choosing a combinable one unchecks the one
 * that was used alone. Picking a promotion that is already chosen (to uncheck it) takes nothing else away.
 */
export function droppedByToggle<T extends Pick<PromotionRecord, "id" | "stacking">>(chosen: readonly T[], pick: T): T[] {
  if (chosen.some((p) => p.id === pick.id)) return [];
  const kept = new Set(togglePromotion(chosen, pick).map((p) => p.id));
  return chosen.filter((p) => !kept.has(p.id));
}

/**
 * Price of one booking with the promotions a guest chose (the backend runs this too and never trusts the client's total).
 * The subtotal is unit price x quantity, and EVERY discount is worked out on that original subtotal: a percentage is a share of
 * the original price (20% and 15% together take 35% off, not 20% and then 15% of what is left) and a fixed amount is taken off
 * the whole booking. So the total does not depend on the order the guest clicked. The discounts together never go above the
 * subtotal, so the total is never below 0. Several promotions are refused unless every one of them can be combined (see canCombine).
 */
export function priceBooking(input: {
  unitPrice: number; quantity: number;
  promotions: readonly Pick<PromotionRecord, "id" | "discountType" | "discountValue" | "stacking">[];
}): BookingPrice {
  if (!canCombine(input.promotions)) return { ok: false, error: "NOT_COMBINABLE" };
  const subtotal = Math.max(0, input.unitPrice) * Math.max(0, input.quantity);
  const ordered = [...input.promotions].sort((a, b) => (a.discountType === b.discountType ? 0 : a.discountType === "FIXED_AMOUNT" ? -1 : 1));
  let left = subtotal;
  const discounts: PriceLine[] = [];
  for (const p of ordered) {
    // Worked out on the original subtotal; `left` only caps it, so the discounts together stay within the price.
    const amount = Math.min(left, discountAmount(subtotal, p));
    discounts.push({ id: p.id, amount });
    left -= amount;
  }
  return { ok: true, subtotal, discounts, discount: subtotal - left, total: left };
}
