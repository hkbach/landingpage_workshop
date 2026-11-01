// SERVER-ONLY stand-in for the promotions table until apps/api exists. Like the report store: the landing page (shop subdomain,
// rendered on the server) and the shop owner area (app host) are different browser origins, so both go through this one in-memory
// store (route handlers under /api/v1/promotions, and direct reads from the server-rendered public page).
// It lives on globalThis so it survives hot reloads and is lost when the server restarts (demo data).
// TODO(api): every query filters by organization_id from the session; the mock has a single shop.
import { activePromotions, MAX_PROMOTIONS_PER_SHOP, type PromotionInput, type PromotionRecord } from "@workshop/shared";
import { dayKey } from "@/lib/format";
import { newUuid } from "@/lib/uuid";
import { currentShop, workshops } from "./data";

const g = globalThis as unknown as { __promotionStore?: PromotionRecord[] };

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
      discountType: "PERCENT", discountValue: 20, code: "EARLY20", appliesTo: "ALL", startDate: day(-10), endDate: day(20),
    },
    {
      ...base, id: "pr-2", title: { en: "Paint your mug for less", vi: "Vẽ men cốc giá tốt" }, description: { en: "100,000 off the mug painting class." },
      discountType: "FIXED_AMOUNT", discountValue: 100_000, code: "MUG100", appliesTo: "SELECTED", workshopIds: ["ws-2"], startDate: day(-3), endDate: day(10),
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
}

export const allPromotions = (): PromotionRecord[] => store().map((p) => ({ ...p }));

export const shopToday = (): string => day(0);

/** Promotions guests see on the landing page today. */
export const publicPromotions = (today = shopToday()): PromotionRecord[] => activePromotions(store(), today).map((p) => ({ ...p }));

const knownWorkshops = () => new Set(workshops.map((w) => w.id));

export type SaveResult =
  | { ok: true; promotion: PromotionRecord }
  | { ok: false; code: "LIMIT" | "NOT_FOUND" | "UNKNOWN_WORKSHOP" };

const fromInput = (input: PromotionInput): Omit<PromotionRecord, "id" | "createdAt" | "updatedAt"> => ({
  title: input.title, description: input.description, discountType: input.discountType, discountValue: input.discountValue,
  ...(input.code ? { code: input.code } : {}),
  appliesTo: input.appliesTo, workshopIds: input.appliesTo === "ALL" ? [] : [...new Set(input.workshopIds)],
  startDate: input.startDate, endDate: input.endDate, enabled: input.enabled,
});

export function createPromotion(input: PromotionInput): SaveResult {
  if (store().length >= MAX_PROMOTIONS_PER_SHOP) return { ok: false, code: "LIMIT" };
  const known = knownWorkshops();
  if (input.workshopIds.some((id) => !known.has(id))) return { ok: false, code: "UNKNOWN_WORKSHOP" };
  const now = new Date().toISOString();
  const promotion: PromotionRecord = { id: `pr-${newUuid().slice(0, 8)}`, ...fromInput(input), createdAt: now, updatedAt: now };
  store().push(promotion);
  return { ok: true, promotion: { ...promotion } };
}

export function updatePromotion(id: string, input: PromotionInput): SaveResult {
  const i = store().findIndex((p) => p.id === id);
  if (i < 0) return { ok: false, code: "NOT_FOUND" };
  const known = knownWorkshops();
  if (input.workshopIds.some((w) => !known.has(w))) return { ok: false, code: "UNKNOWN_WORKSHOP" };
  const prev = store()[i]!;
  const next: PromotionRecord = { id, ...fromInput(input), createdAt: prev.createdAt, updatedAt: new Date().toISOString() };
  store()[i] = next;
  return { ok: true, promotion: { ...next } };
}

export function setPromotionEnabled(id: string, enabled: boolean): SaveResult {
  const p = store().find((x) => x.id === id);
  if (!p) return { ok: false, code: "NOT_FOUND" };
  p.enabled = enabled;
  p.updatedAt = new Date().toISOString();
  return { ok: true, promotion: { ...p } };
}

export function deletePromotion(id: string): boolean {
  const i = store().findIndex((p) => p.id === id);
  if (i < 0) return false;
  store().splice(i, 1);
  return true;
}
