// SERVER-ONLY stand-in for the promotions table until apps/api exists. Like the report store: the landing page (shop subdomain,
// rendered on the server) and the shop owner area (app host) are different browser origins, so both go through this one in-memory
// store (route handlers under /api/v1/promotions, and direct reads from the server-rendered public page).
// It lives on globalThis so it survives hot reloads and is lost when the server restarts (demo data).
// TODO(api): every query filters by organization_id from the session; the mock has a single shop.
import {
  activePromotions, firstOverloadedDay, MAX_PROMOTIONS_PER_SHOP, platformMediaId, type PromotionInput, type PromotionRecord,
} from "@workshop/shared";
import { dayKey } from "@/lib/format";
import { newUuid } from "@/lib/uuid";
import { currentShop, workshops } from "./data";
import { deleteImage, hasImage, resetMediaStore } from "./media-store";

const g = globalThis as unknown as { __promotionStore?: PromotionRecord[]; __promotionSeedVersion?: number };

/** Bump when the seed or the shape of a promotion changes: a dev server that kept the old data across hot reloads starts again from the new seed. */
const SEED_VERSION = 3;

const DAY = 86_400_000;
/** "YYYY-MM-DD" of today +/- `days` in the shop timezone. */
function day(days: number): string {
  return dayKey(new Date(Date.now() + days * DAY).toISOString(), currentShop.timezone);
}

type SeedRow = Pick<PromotionRecord, "id" | "title" | "discountType" | "discountValue" | "stacking" | "startDate" | "endDate"> & Partial<Pick<PromotionRecord, "description" | "code" | "imageUrl" | "appliesTo" | "workshopIds" | "enabled">>;

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
      id: "pr-2", title: { en: "Paint your mug for less", vi: "Vẽ men cốc giá tốt" }, discountType: "FIXED_AMOUNT", discountValue: 100_000, stacking: "SINGLE", code: "MUG100", imageUrl: img("mugsale"),
      description: { en: "100,000 off the mug painting class." }, appliesTo: "SELECTED", workshopIds: ["ws-2"], startDate: day(-3), endDate: day(10),
    },
    {
      id: "pr-5", title: { en: "Date night: 150,000 off" }, discountType: "FIXED_AMOUNT", discountValue: 150_000, stacking: "MULTIPLE", code: "COUPLE150", imageUrl: img("datenight"),
      description: { en: "Bring a partner to the pottery wheel class and take 150,000 off the booking." }, appliesTo: "SELECTED", workshopIds: ["ws-1"], startDate: day(-5), endDate: day(12),
    },
    {
      id: "pr-6", title: { en: "Groups save 15%", vi: "Đi nhóm giảm 15%" }, discountType: "PERCENT", discountValue: 15, stacking: "MULTIPLE",
      description: { en: "Friends, teams and families: 15% off every workshop." }, startDate: day(-2), endDate: day(25),
    },
    {
      id: "pr-7", title: { en: "Newsletter friends: 5% off" }, discountType: "PERCENT", discountValue: 5, stacking: "MULTIPLE", code: "NEWS5", imageUrl: img("newsletter"), startDate: day(-20), endDate: day(8),
    },
    // Scheduled (3)
    {
      id: "pr-3", title: { en: "Autumn festival" }, discountType: "PERCENT", discountValue: 15, stacking: "SINGLE",
      description: { en: "15% off every workshop during the festival." }, startDate: day(14), endDate: day(30),
    },
    {
      id: "pr-8", title: { en: "Black Friday: 30% off" }, discountType: "PERCENT", discountValue: 30, stacking: "SINGLE", code: "BLACK30", imageUrl: img("blackfriday"),
      description: { en: "Our biggest discount of the year, for three days only." }, startDate: day(26), endDate: day(28),
    },
    {
      id: "pr-9", title: { en: "Gift a class: 200,000 off" }, discountType: "FIXED_AMOUNT", discountValue: 200_000, stacking: "MULTIPLE", code: "GIFT200",
      description: { en: "Give the gift of clay this season." }, appliesTo: "SELECTED", workshopIds: ["ws-1", "ws-2"], startDate: day(45), endDate: day(60),
    },
    // Scheduled, far away
    {
      id: "pr-10", title: { en: "New year, new hobby", vi: "Năm mới, sở thích mới" }, discountType: "PERCENT", discountValue: 12, stacking: "MULTIPLE", imageUrl: img("newyear"),
      description: { en: "Start the year with a first class." }, startDate: day(62), endDate: day(75),
    },
    // Over (2)
    {
      id: "pr-4", title: { en: "Spring sale" }, discountType: "PERCENT", discountValue: 10, stacking: "SINGLE", description: { en: "10% off." }, startDate: day(-60), endDate: day(-30),
    },
    {
      id: "pr-11", title: { en: "Summer splash: 25% off" }, discountType: "PERCENT", discountValue: 25, stacking: "SINGLE", code: "SPLASH25", imageUrl: img("summersplash"),
      description: { en: "Cool down with clay." }, startDate: day(-120), endDate: day(-90),
    },
    {
      id: "pr-12", title: { en: "Mid-autumn: 80,000 off" }, discountType: "FIXED_AMOUNT", discountValue: 80_000, stacking: "MULTIPLE", startDate: day(-50), endDate: day(-35),
    },
    // Paused (2): they would run today, but resuming one would be a 6th running promotion
    {
      id: "pr-13", title: { en: "Student discount" }, discountType: "PERCENT", discountValue: 10, stacking: "MULTIPLE", code: "STUDENT10",
      description: { en: "Show a student card at the studio." }, enabled: false, startDate: day(-10), endDate: day(40),
    },
    {
      id: "pr-14", title: { en: "Rainy day special" }, discountType: "FIXED_AMOUNT", discountValue: 60_000, stacking: "SINGLE", imageUrl: img("rainyday"),
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
  stacking: input.stacking, appliesTo: input.appliesTo, workshopIds: input.appliesTo === "ALL" ? [] : [...new Set(input.workshopIds)],
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
