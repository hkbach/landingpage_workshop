// SERVER-ONLY stand-in for the promotions table until apps/api exists. Like the report store: the landing page (shop subdomain,
// rendered on the server) and the shop owner area (app host) are different browser origins, so both go through this one in-memory
// store (route handlers under /api/v1/promotions, and direct reads from the server-rendered public page).
// It lives on globalThis so it survives hot reloads and is lost when the server restarts (demo data).
// TODO(api): every query filters by organization_id from the session; the mock has a single shop.
import {
  activePromotions, bookingsBlockingPause, canEditPromotion, firstOverloadedDay, fullDiscountWorkshops, isPromotionCodeTaken, isPromotionDeletable, MAX_PROMOTIONS_PER_SHOP, platformMediaId, promotionStatus, type PromotionInput, type PromotionRecord,
} from "@workshop/shared";
import { dayKey } from "@/lib/format";
import { newUuid } from "@/lib/uuid";
import { currentShop, workshops } from "./data";
import { bookingUses } from "./booking-store";
import { deleteImage, hasImage, resetMediaStore } from "./media-store";

const g = globalThis as unknown as { __promotionStore?: PromotionRecord[]; __promotionSeedVersion?: number };

/** Bump when the seed or the shape of a promotion changes: a dev server that kept the old data across hot reloads starts again from the new seed. */
const SEED_VERSION = 6;

const DAY = 86_400_000;
/** "YYYY-MM-DD" of today +/- `days` in the shop timezone. */
function day(days: number): string {
  return dayKey(new Date(Date.now() + days * DAY).toISOString(), currentShop.timezone);
}

type SeedRow = Pick<PromotionRecord, "id" | "title" | "code" | "discountType" | "discountValue" | "stacking" | "startDate" | "endDate"> & Partial<Pick<PromotionRecord, "description" | "imageUrl" | "appliesTo" | "workshopIds" | "enabled">>;

/**
 * Demo data: 14 promotions that show every state on the management page and the landing page: 5 running (the most allowed at once),
 * 4 scheduled or paused, 3 over, with and without image, code and description, percentage and fixed amount, all or selected
 * workshops, to be used alone or combined, one with a Vietnamese title. Never more than 5 enabled promotions overlap.
 */
function seed(): PromotionRecord[] {
  const now = new Date().toISOString();
  const img = (name: string) => `https://picsum.photos/seed/${name}/800/500`;
  const rows: SeedRow[] = [
    // Running today (5)
    {
      id: "pr-1", title: { en: "Early bird: 20% off", vi: "Đặt sớm: giảm 20%" }, discountType: "PERCENT", discountValue: 20, stacking: "SINGLE", code: "EARLY20", imageUrl: img("earlybird"),
      description: { en: "Book any workshop and pay 20% less. Mention the code at the studio.", vi: "Đặt bất kỳ workshop nào và trả ít hơn 20%." }, startDate: day(-10), endDate: day(20),
    },
    {
      id: "pr-2", title: { en: "Cupcake class for less", vi: "Lớp cupcake giá tốt" }, discountType: "FIXED_AMOUNT", discountValue: 100_000, stacking: "SINGLE", code: "CAKE100", imageUrl: img("cakesale"),
      description: { en: "100,000 off the cupcake decorating class." }, appliesTo: "SELECTED", workshopIds: ["ws-2"], startDate: day(-3), endDate: day(10),
    },
    {
      id: "pr-5", title: { en: "Date night: 150,000 off" }, discountType: "FIXED_AMOUNT", discountValue: 150_000, stacking: "MULTIPLE", code: "COUPLE150", imageUrl: img("datenight"),
      description: { en: "Bring a partner to the fresh pasta class and take 150,000 off the booking." }, appliesTo: "SELECTED", workshopIds: ["ws-1"], startDate: day(-5), endDate: day(12),
    },
    {
      id: "pr-6", code: "GROUP15", title: { en: "Groups save 15%", vi: "Đi nhóm giảm 15%" }, discountType: "PERCENT", discountValue: 15, stacking: "MULTIPLE",
      description: { en: "Friends, teams and families: 15% off every workshop." }, startDate: day(-2), endDate: day(25),
    },
    {
      id: "pr-7", title: { en: "Newsletter friends: 5% off" }, discountType: "PERCENT", discountValue: 5, stacking: "MULTIPLE", code: "NEWS5", imageUrl: img("newsletter"), startDate: day(-20), endDate: day(8),
    },
    // Scheduled (3)
    {
      id: "pr-3", code: "AUTUMN15", title: { en: "Autumn festival" }, discountType: "PERCENT", discountValue: 15, stacking: "SINGLE",
      description: { en: "15% off every workshop during the festival." }, startDate: day(14), endDate: day(30),
    },
    {
      id: "pr-8", title: { en: "Black Friday: 30% off" }, discountType: "PERCENT", discountValue: 30, stacking: "SINGLE", code: "BLACK30", imageUrl: img("blackfriday"),
      description: { en: "Our biggest discount of the year, for three days only." }, startDate: day(26), endDate: day(28),
    },
    {
      id: "pr-9", title: { en: "Gift a class: 200,000 off" }, discountType: "FIXED_AMOUNT", discountValue: 200_000, stacking: "MULTIPLE", code: "GIFT200",
      description: { en: "Give the gift of a class this season." }, appliesTo: "SELECTED", workshopIds: ["ws-1", "ws-2"], startDate: day(45), endDate: day(60),
    },
    // Scheduled, far away
    {
      id: "pr-10", code: "NEWYEAR12", title: { en: "New year, new hobby", vi: "Năm mới, sở thích mới" }, discountType: "PERCENT", discountValue: 12, stacking: "MULTIPLE", imageUrl: img("newyear"),
      description: { en: "Start the year with a first class." }, startDate: day(62), endDate: day(75),
    },
    // Over (2)
    {
      id: "pr-4", code: "SPRING10", title: { en: "Spring sale" }, discountType: "PERCENT", discountValue: 10, stacking: "SINGLE", description: { en: "10% off." }, startDate: day(-60), endDate: day(-30),
    },
    {
      id: "pr-11", title: { en: "Summer splash: 25% off" }, discountType: "PERCENT", discountValue: 25, stacking: "SINGLE", code: "SPLASH25", imageUrl: img("summersplash"),
      description: { en: "Beat the heat with a cool class." }, startDate: day(-120), endDate: day(-90),
    },
    {
      id: "pr-12", code: "MIDAUTUMN80", title: { en: "Mid-autumn: 80,000 off" }, discountType: "FIXED_AMOUNT", discountValue: 80_000, stacking: "MULTIPLE", startDate: day(-50), endDate: day(-35),
    },
    // Paused (2): they would run today, but resuming one would be a 6th running promotion
    {
      id: "pr-13", title: { en: "Student discount" }, discountType: "PERCENT", discountValue: 10, stacking: "MULTIPLE", code: "STUDENT10",
      description: { en: "Show a student card at the studio." }, enabled: false, startDate: day(-10), endDate: day(40),
    },
    {
      id: "pr-14", code: "RAINY60", title: { en: "Rainy day special" }, discountType: "FIXED_AMOUNT", discountValue: 60_000, stacking: "SINGLE", imageUrl: img("rainyday"),
      description: { en: "A cosy class for a grey afternoon." }, appliesTo: "SELECTED", workshopIds: ["ws-2"], enabled: false, startDate: day(-1), endDate: day(14),
    },
  ];
  return rows.map((r, i) => ({
    description: {}, appliesTo: "ALL", workshopIds: [], enabled: true, ...r,
    // Distinct creation times, so the list order (newest first) is the same every time.
    createdAt: new Date(Date.parse(now) - i * 60_000).toISOString(), updatedAt: now,
  }));
}
function store(): PromotionRecord[] {
  if (g.__promotionSeedVersion !== SEED_VERSION) {
    g.__promotionStore = seed();
    g.__promotionSeedVersion = SEED_VERSION;
  }
  return (g.__promotionStore ??= seed());
}

/** Test helper: back to the seed data. */
export function resetPromotionStore(): void {
  (globalThis as unknown as { __promotionHolds?: unknown }).__promotionHolds = undefined;
  g.__promotionStore = seed();
  g.__promotionSeedVersion = SEED_VERSION;
  resetMediaStore();
}

export const allPromotions = (): PromotionRecord[] => store().map((p) => ({ ...p }));

export const shopToday = (): string => day(0);

/** Promotions guests see on the landing page today. */
export const publicPromotions = (today = shopToday()): PromotionRecord[] => activePromotions(store(), today).map((p) => ({ ...p }));

const knownWorkshops = () => new Set(workshops.map((w) => w.id));

export type SaveResult =
  | { ok: true; promotion: PromotionRecord }
  | { ok: false; code: "LIMIT" | "NOT_FOUND" | "UNKNOWN_WORKSHOP" | "UNKNOWN_IMAGE" | "HELD_BY_ADMIN" }
  /** More than the allowed number of promotions would run at once on `date`. */
  | { ok: false; code: "CONCURRENT_LIMIT"; date: string }
  /** A guest could get these workshops for nothing (100% off) with this promotion next to the others. */
  | { ok: false; code: "FULL_DISCOUNT"; workshopIds: string[] }
  /** Another promotion of this shop already uses the code. */
  | { ok: false; code: "CODE_TAKEN" }
  /** The last day is before today (shop time). */
  | { ok: false; code: "END_IN_PAST" }
  /** An active promotion cannot be edited: pause it first. */
  | { ok: false; code: "EDIT_ACTIVE" }
  /** Guests used the promotion in bookings of sessions that have not ended: it cannot be paused yet. */
  | { ok: false; code: "IN_USE"; bookingCodes: string[] };

/** The booking codes that stop a promotion from being paused now (empty when it can be paused). */
function pauseBlockers(promotionId: string): string[] {
  const now = new Date();
  return bookingsBlockingPause(promotionId, bookingUses(), now).map((b) => b.bookingCode);
}

/** Workshops a promotion would make free (empty when it is fine). */
function freeWorkshops(candidate: PromotionRecord, others: readonly PromotionRecord[]): string[] {
  return fullDiscountWorkshops(candidate, others, workshops, shopToday()).map((r) => r.workshopId);
}

/** A platform image must exist (it was uploaded); an https URL or no image is always fine. */
function imageProblem(url: string | undefined): boolean {
  const id = platformMediaId(url);
  return id !== null && !hasImage(id);
}

const fromInput = (input: PromotionInput): Omit<PromotionRecord, "id" | "createdAt" | "updatedAt"> => ({
  title: input.title, description: input.description, discountType: input.discountType, discountValue: input.discountValue,
  code: input.code,
  ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
  stacking: input.stacking, appliesTo: input.appliesTo, workshopIds: input.appliesTo === "ALL" ? [] : [...new Set(input.workshopIds)],
  startDate: input.startDate, endDate: input.endDate, enabled: input.enabled,
});

export function createPromotion(input: PromotionInput): SaveResult {
  if (store().length >= MAX_PROMOTIONS_PER_SHOP) return { ok: false, code: "LIMIT" };
  const known = knownWorkshops();
  if (input.workshopIds.some((id) => !known.has(id))) return { ok: false, code: "UNKNOWN_WORKSHOP" };
  if (imageProblem(input.imageUrl)) return { ok: false, code: "UNKNOWN_IMAGE" };
  if (input.endDate < shopToday()) return { ok: false, code: "END_IN_PAST" };
  if (isPromotionCodeTaken(store(), input.code)) return { ok: false, code: "CODE_TAKEN" };
  const now = new Date().toISOString();
  const promotion: PromotionRecord = { id: `pr-${newUuid().slice(0, 8)}`, ...fromInput(input), createdAt: now, updatedAt: now };
  const free = freeWorkshops(promotion, store());
  if (free.length > 0) return { ok: false, code: "FULL_DISCOUNT", workshopIds: free };
  const date = firstOverloadedDay([...store(), promotion], shopToday());
  if (date) return { ok: false, code: "CONCURRENT_LIMIT", date };
  store().push(promotion);
  return { ok: true, promotion: { ...promotion } };
}

export function updatePromotion(id: string, input: PromotionInput): SaveResult {
  const i = store().findIndex((p) => p.id === id);
  if (i < 0) return { ok: false, code: "NOT_FOUND" };
  const known = knownWorkshops();
  if (input.workshopIds.some((w) => !known.has(w))) return { ok: false, code: "UNKNOWN_WORKSHOP" };
  if (imageProblem(input.imageUrl)) return { ok: false, code: "UNKNOWN_IMAGE" };
  if (isPromotionCodeTaken(store(), input.code, id)) return { ok: false, code: "CODE_TAKEN" };
  const prev = store()[i]!;
  if (!canEditPromotion(promotionStatus(prev, shopToday()))) return { ok: false, code: "EDIT_ACTIVE" };
  if (input.endDate < shopToday()) return { ok: false, code: "END_IN_PAST" };
  const next: PromotionRecord = { id, ...fromInput(input), createdAt: prev.createdAt, updatedAt: new Date().toISOString() };
  // Switching it off (here or with the Pause button) is refused while guests are using it in bookings of sessions that have not ended.
  if (prev.enabled && !next.enabled) {
    const used = pauseBlockers(id);
    if (used.length > 0) return { ok: false, code: "IN_USE", bookingCodes: used };
  }
  const free = freeWorkshops(next, store().filter((p) => p.id !== id));
  if (free.length > 0) return { ok: false, code: "FULL_DISCOUNT", workshopIds: free };
  const date = firstOverloadedDay(store().map((p) => (p.id === id ? next : p)), shopToday());
  if (date) return { ok: false, code: "CONCURRENT_LIMIT", date };
  store()[i] = next;
  // A replaced or removed image is not kept.
  if (platformMediaId(prev.imageUrl) !== platformMediaId(next.imageUrl)) deleteImage(platformMediaId(prev.imageUrl));
  return { ok: true, promotion: { ...next } };
}

export function setPromotionEnabled(id: string, enabled: boolean): SaveResult {
  const p = store().find((x) => x.id === id);
  if (!p) return { ok: false, code: "NOT_FOUND" };
  if (enabled && holds().has(id)) return { ok: false, code: "HELD_BY_ADMIN" }; // paused by an administrator: only an administrator can resume it
  if (!enabled && p.enabled) {
    const used = pauseBlockers(id);
    if (used.length > 0) return { ok: false, code: "IN_USE", bookingCodes: used };
  }
  if (enabled && !p.enabled && p.endDate < shopToday()) return { ok: false, code: "END_IN_PAST" };
  // Resuming is like adding it again: it can make a workshop free, or push the number running at once over the limit.
  if (enabled) {
    const free = freeWorkshops({ ...p, enabled }, store().filter((x) => x.id !== id));
    if (free.length > 0) return { ok: false, code: "FULL_DISCOUNT", workshopIds: free };
  }
  const date = enabled ? firstOverloadedDay(store().map((x) => (x.id === id ? { ...x, enabled } : x)), shopToday()) : null;
  if (date) return { ok: false, code: "CONCURRENT_LIMIT", date };
  p.enabled = enabled;
  p.updatedAt = new Date().toISOString();
  return { ok: true, promotion: { ...p } };
}

export type DeleteResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "NOT_DELETABLE" };

/** Only a paused or expired promotion can be deleted (never one that is active or still to start). */
export function deletePromotion(id: string): DeleteResult {
  const i = store().findIndex((p) => p.id === id);
  if (i < 0) return { ok: false, code: "NOT_FOUND" };
  if (!isPromotionDeletable(store()[i]!, shopToday())) return { ok: false, code: "NOT_DELETABLE" };
  deleteImage(platformMediaId(store()[i]!.imageUrl));
  holds().delete(id);
  store().splice(i, 1);
  return { ok: true };
}

// ---- an administrator pauses a voucher (promotion) that breaks the rules, and resumes it ---------------------------------------------------------------------------------------------

/** Promotions an administrator paused: id -> { reason, whether it was running (enabled) before, when }. The shop owner sees them as paused by the platform and cannot resume them. */
const gh = globalThis as unknown as { __promotionHolds?: Map<string, { reason: string; wasEnabled: boolean; at: string }> };
const holds = () => (gh.__promotionHolds ??= new Map());
export const promotionHold = (id: string): { reason: string; at: string } | undefined => { const h = holds().get(id); return h ? { reason: h.reason, at: h.at } : undefined; };

/** An administrator pauses a promotion (a reason is needed) or resumes one they paused. Unlike the shop owner, an administrator is not stopped by the bookings that use it: what was booked keeps its discount. */
export function holdPromotion(id: string, hold: boolean, reason = "", now = new Date()): { ok: true; promotion: PromotionRecord } | { ok: false; code: "NOT_FOUND" | "REASON_REQUIRED" | "NOT_HELD" | "ALREADY_HELD" } {
  const p = store().find((x) => x.id === id);
  if (!p) return { ok: false, code: "NOT_FOUND" };
  if (hold) {
    if (!reason.trim()) return { ok: false, code: "REASON_REQUIRED" };
    if (holds().has(id)) return { ok: false, code: "ALREADY_HELD" };
    holds().set(id, { reason: reason.trim().slice(0, 300), wasEnabled: p.enabled, at: now.toISOString() });
    p.enabled = false;
  } else {
    const h = holds().get(id);
    if (!h) return { ok: false, code: "NOT_HELD" };
    holds().delete(id);
    p.enabled = h.wasEnabled && p.endDate >= shopToday(); // it runs again if it was running before and is not over
  }
  p.updatedAt = now.toISOString();
  return { ok: true, promotion: { ...p } };
}

/** An administrator removed an uploaded image: the promotions that showed it have no image any more. Returns how many were changed. */
export function clearPromotionImage(mediaId: string, now = new Date()): number {
  let n = 0;
  for (const p of store()) {
    if (platformMediaId(p.imageUrl) === mediaId) { delete p.imageUrl; p.updatedAt = now.toISOString(); n += 1; }
  }
  return n;
}
