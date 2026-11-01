import {
  activePromotions, priceBooking, promotionAppliesTo, promotionStatus, type PromotionRecord, type PromotionStatus,
} from "./promotions";

// Two helpers of the Promotion management page: searching the list, and warning the shop owner when promotions pile up so much
// that a workshop could be sold for almost nothing.

// ---- search ------------------------------------------------------------------------------------------------------------------

export interface PromotionFilter {
  /** Part of the title, in any language; case and accents do not matter. */
  q?: string;
  status?: PromotionStatus;
  /** Only promotions that apply to this workshop (a promotion for all workshops applies to every one). */
  workshopId?: string;
  /** Business dates ("YYYY-MM-DD"): promotions whose period overlaps from..to. Either end may be left out. */
  from?: string;
  to?: string;
}

/** Lower case, without accents: "Đặt sớm" matches "dat som". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();

export function filterPromotions<T extends Pick<PromotionRecord, "title" | "enabled" | "startDate" | "endDate" | "appliesTo" | "workshopIds">>(
  list: readonly T[], f: PromotionFilter, today: string,
): T[] {
  const q = fold(f.q?.trim() ?? "");
  // A range typed the wrong way round still means "between these two days".
  const [from, to] = f.from && f.to && f.from > f.to ? [f.to, f.from] : [f.from, f.to];
  return list.filter((p) => {
    if (q && !Object.values(p.title).some((t) => typeof t === "string" && fold(t).includes(q))) return false;
    if (f.status && promotionStatus(p, today) !== f.status) return false;
    if (f.workshopId && !promotionAppliesTo(p, f.workshopId)) return false;
    if (from && p.endDate < from) return false;
    if (to && p.startDate > to) return false;
    return true;
  });
}

// ---- over budget -------------------------------------------------------------------------------------------------------------

/** A workshop is "over budget" when a guest could get this share of its price (or more) off. */
export const OVER_BUDGET_PERCENT = 80;
/** A promotion that lets a guest get a workshop for nothing (100% off) is not allowed at all. */
export const FULL_DISCOUNT_PERCENT = 100;

type Discounting = Pick<PromotionRecord, "id" | "discountType" | "discountValue" | "stacking">;

export interface DeepestDiscount { amount: number; percent: number; promotionIds: string[] }

/**
 * The most a guest can take off one workshop booking (one guest) with these promotions, given the rules for combining: either
 * everything that can be combined together, or one promotion that must be used alone, whichever takes more off.
 */
export function deepestDiscount(price: number, promotions: readonly Discounting[]): DeepestDiscount {
  const sets: Discounting[][] = [promotions.filter((p) => p.stacking === "MULTIPLE"), ...promotions.filter((p) => p.stacking === "SINGLE").map((p) => [p])];
  let best: DeepestDiscount = { amount: 0, percent: 0, promotionIds: [] };
  for (const set of sets) {
    if (set.length === 0) continue;
    const r = priceBooking({ unitPrice: price, quantity: 1, promotions: set });
    if (r.ok && r.discount > best.amount) best = { amount: r.discount, percent: price > 0 ? (r.discount / price) * 100 : 0, promotionIds: set.map((p) => p.id) };
  }
  return best;
}

type Budgeted = Discounting & Pick<PromotionRecord, "enabled" | "startDate" | "endDate" | "appliesTo" | "workshopIds">;

export interface OverBudgetWorkshop { workshopId: string; percent: number; promotionIds: string[] }

/**
 * The workshops the `candidate` promotion covers that could reach `limitPercent` off (or more) once it runs next to the
 * promotions already there. Only promotions that are enabled and run on the same days count, and each day is looked at on its
 * own: promotions that never run together do not add up. `others` must not contain the candidate itself (when editing, leave
 * the saved version out). A paused candidate never warns.
 */
export function overBudgetWorkshops(
  candidate: Budgeted, others: readonly Budgeted[], workshops: readonly { id: string; priceAmount: number }[], limitPercent = OVER_BUDGET_PERCENT,
): OverBudgetWorkshop[] {
  if (!candidate.enabled) return [];
  const out: OverBudgetWorkshop[] = [];
  for (const w of workshops) {
    if (!(w.priceAmount > 0) || !promotionAppliesTo(candidate, w.id)) continue;
    const peers = [candidate, ...others.filter((o) => o.id !== candidate.id && o.enabled && promotionAppliesTo(o, w.id))];
    // The set of running promotions only grows on a start date, so those days (inside the candidate's period) are enough.
    const days = new Set([candidate.startDate, ...peers.map((p) => p.startDate).filter((d) => d > candidate.startDate && d <= candidate.endDate)]);
    let worst: DeepestDiscount | null = null;
    for (const d of days) {
      const running = peers.filter((p) => p.startDate <= d && d <= p.endDate);
      const deepest = deepestDiscount(w.priceAmount, running);
      if (deepest.amount * 100 >= limitPercent * w.priceAmount && (!worst || deepest.amount > worst.amount)) worst = deepest;
    }
    // Shown with one decimal, but "100" only when the workshop really would be free (649,999 off 650,000 is 99.9, not 100).
    if (worst) out.push({ workshopId: w.id, percent: worst.amount >= w.priceAmount ? 100 : Math.min(99.9, Math.round(worst.percent * 10) / 10), promotionIds: worst.promotionIds });
  }
  return out;
}

/**
 * The workshops the `candidate` promotion covers that a guest could get for nothing once it runs next to the promotions already
 * there (the deepest discount reaches the whole price). Same days-and-combining rules as overBudgetWorkshops. A promotion that
 * returns anything here must not be saved (or resumed). `others` must not contain the candidate itself.
 */
export function fullDiscountWorkshops(
  candidate: Budgeted, others: readonly Budgeted[], workshops: readonly { id: string; priceAmount: number }[],
): OverBudgetWorkshop[] {
  return overBudgetWorkshops(candidate, others, workshops, FULL_DISCOUNT_PERCENT);
}

// ---- per workshop ------------------------------------------------------------------------------------------------------------

export interface WorkshopPromotions<T extends PromotionRecord = PromotionRecord> {
  /** The promotions a guest can use on this workshop today (active and covering it), newest start first. */
  applicable: T[];
  /**
   * The promotions that can be combined (MULTIPLE) and the most they take off one guest's price when ALL of them are applied together
   * (percentages added on the original price, plus fixed amounts, never above the price). `discount.amount` is 0 when there are none.
   */
  combined: { promotions: T[]; discount: DeepestDiscount; priceAfter: number };
  /** The promotions that must be used alone (SINGLE), each with what it takes off the price on its own. */
  alone: { promotion: T; amount: number; percent: number }[];
}

/** Shown on the shop owner's workshop list: which promotions apply to a workshop and how deep each way of using them goes. */
export function workshopPromotions<T extends PromotionRecord>(workshop: { id: string; priceAmount: number }, promotions: readonly T[], today: string): WorkshopPromotions<T> {
  const price = workshop.priceAmount;
  const applicable = activePromotions(promotions, today).filter((p) => promotionAppliesTo(p, workshop.id));
  const combinable = applicable.filter((p) => p.stacking === "MULTIPLE");
  const discount = deepestDiscount(price, combinable);
  const alone = applicable
    .filter((p) => p.stacking === "SINGLE")
    .map((promotion) => {
      const r = priceBooking({ unitPrice: price, quantity: 1, promotions: [promotion] });
      const amount = r.ok ? r.discount : 0;
      return { promotion, amount, percent: price > 0 ? (amount / price) * 100 : 0 };
    });
  return { applicable, combined: { promotions: combinable, discount, priceAfter: price - discount.amount }, alone };
}
