// SERVER-ONLY stand-in for the promotions table until apps/api exists. Like the report store: the landing page (shop subdomain,
// rendered on the server) and the shop owner area (app host) are different browser origins, so both go through this one in-memory
// store (route handlers under /api/v1/promotions, and direct reads from the server-rendered public page).
// It lives on globalThis so it survives hot reloads and is lost when the server restarts (demo data).
// TODO(api): every query filters by organization_id from the session; the mock has a single shop.
import {
  activePromotions, DEFAULT_STACKING, firstOverloadedDay, MAX_PROMOTIONS_PER_SHOP, platformMediaId, type PromotionInput, type PromotionRecord, type StackingMode,
} from "@workshop/shared";
import { dayKey } from "@/lib/format";
import { newUuid } from "@/lib/uuid";
import { currentShop, workshops } from "./data";
import { deleteImage, hasImage, resetMediaStore } from "./media-store";

const g = globalThis as unknown as { __promotionStore?: PromotionRecord[]; __promotionStacking?: StackingMode };

const DAY = 86_400_000;
/** "YYYY-MM-DD" of today +/- `days` in the shop timezone. */
function day(days: number): string {
  return dayKey(new Date(Date.now() + days * DAY).toISOString(), currentShop.timezone);
}

function seed(): PromotionRecord[] {
  const now = new Date().toISOString();
  const base = { workshopIds: [] as string[], enabled: true, createdAt: now, updatedAt: now };
  return [
    {
      ...base, id: "pr-1", title: { en: "Early bird: 20% off", vi: "Đặt sớm: giảm 20%" },
      description: { en: "Book any workshop and pay 20% less. Mention the code at the studio.", vi: "Đặt bất kỳ workshop nào và trả ít hơn 20%." },
      discountType: "PERCENT", discountValue: 20, code: "EARLY20", imageUrl: "https://picsum.photos/seed/earlybird/800/500", appliesTo: "ALL", startDate: day(-10), endDate: day(20),
    },
    {
      ...base, id: "pr-2", title: { en: "Paint your mug for less", vi: "Vẽ men cốc giá tốt" }, description: { en: "100,000 off the mug painting class." },
      discountType: "FIXED_AMOUNT", discountValue: 100_000, code: "MUG100", imageUrl: "https://picsum.photos/seed/mugsale/800/500", appliesTo: "SELECTED", workshopIds: ["ws-2"], startDate: day(-3), endDate: day(10),
    },
    {
      ...base, id: "pr-3", title: { en: "Autumn festival" }, description: { en: "15% off every workshop during the festival." },
      discountType: "PERCENT", discountValue: 15, appliesTo: "ALL", startDate: day(14), endDate: day(30),
    },
    {
      ...base, id: "pr-4", title: { en: "Spring sale" }, description: { en: "10% off." },
      discountType: "PERCENT", discountValue: 10, appliesTo: "ALL", startDate: day(-60), endDate: day(-30),
    },
  ];
}
function store(): PromotionRecord[] {
  return (g.__promotionStore ??= seed());
}

/** Test helper: back to the seed data. */
export function resetPromotionStore(): void {
  g.__promotionStore = seed();
  g.__promotionStacking = DEFAULT_STACKING;
  resetMediaStore();
}

/** How guests may use promotions on one booking (shop setting). */
export const getStacking = (): StackingMode => (g.__promotionStacking ??= DEFAULT_STACKING);
export function setStacking(mode: StackingMode): void {
  g.__promotionStacking = mode;
}

export const allPromotions = (): PromotionRecord[] => store().map((p) => ({ ...p }));

export const shopToday = (): string => day(0);

/** Promotions guests see on the landing page today. */
export const publicPromotions = (today = shopToday()): PromotionRecord[] => activePromotions(store(), today).map((p) => ({ ...p }));

const knownWorkshops = () => new Set(workshops.map((w) => w.id));

export type SaveResult =
  | { ok: true; promotion: PromotionRecord }
  | { ok: false; code: "LIMIT" | "NOT_FOUND" | "UNKNOWN_WORKSHOP" | "UNKNOWN_IMAGE" }
  /** More than the allowed number of promotions would run at once on `date`. */
  | { ok: false; code: "CONCURRENT_LIMIT"; date: string };

/** A platform image must exist (it was uploaded); an https URL or no image is always fine. */
function imageProblem(url: string | undefined): boolean {
  const id = platformMediaId(url);
  return id !== null && !hasImage(id);
}

const fromInput = (input: PromotionInput): Omit<PromotionRecord, "id" | "createdAt" | "updatedAt"> => ({
  title: input.title, description: input.description, discountType: input.discountType, discountValue: input.discountValue,
  ...(input.code ? { code: input.code } : {}),
  ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
  appliesTo: input.appliesTo, workshopIds: input.appliesTo === "ALL" ? [] : [...new Set(input.workshopIds)],
  startDate: input.startDate, endDate: input.endDate, enabled: input.enabled,
});

export function createPromotion(input: PromotionInput): SaveResult {
  if (store().length >= MAX_PROMOTIONS_PER_SHOP) return { ok: false, code: "LIMIT" };
  const known = knownWorkshops();
  if (input.workshopIds.some((id) => !known.has(id))) return { ok: false, code: "UNKNOWN_WORKSHOP" };
  if (imageProblem(input.imageUrl)) return { ok: false, code: "UNKNOWN_IMAGE" };
  const now = new Date().toISOString();
  const promotion: PromotionRecord = { id: `pr-${newUuid().slice(0, 8)}`, ...fromInput(input), createdAt: now, updatedAt: now };
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
  const prev = store()[i]!;
  const next: PromotionRecord = { id, ...fromInput(input), createdAt: prev.createdAt, updatedAt: new Date().toISOString() };
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
  // Resuming can push the number of promotions running at once over the limit.
  const date = enabled ? firstOverloadedDay(store().map((x) => (x.id === id ? { ...x, enabled } : x)), shopToday()) : null;
  if (date) return { ok: false, code: "CONCURRENT_LIMIT", date };
  p.enabled = enabled;
  p.updatedAt = new Date().toISOString();
  return { ok: true, promotion: { ...p } };
}

export function deletePromotion(id: string): boolean {
  const i = store().findIndex((p) => p.id === id);
  if (i < 0) return false;
  deleteImage(platformMediaId(store()[i]!.imageUrl));
  store().splice(i, 1);
  return true;
}
