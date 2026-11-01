import { beforeEach, describe, expect, it } from "vitest";
import { firstOverloadedDay, MAX_PROMOTIONS_PER_SHOP, promotionStatus, type PromotionRecord } from "@workshop/shared";
import { allPromotions, publicPromotions, resetPromotionStore, shopToday } from "@/lib/mock/promotion-store";
import { GET, POST } from "./promotions/route";
import { DELETE, PATCH, PUT } from "./promotions/[id]/route";

// The contract of the promotion endpoints (mock handlers today, apps/api later).

const ctx = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const json = (method: string, body: unknown, raw?: string) => new Request("http://x/api/v1/promotions", { method, headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });
const list = async () => (await GET()).json() as Promise<{ items: PromotionRecord[]; today: string; limit: number }>;
const good = {
  title: { en: "Lantern night" }, description: { en: "10% off" }, discountType: "PERCENT", discountValue: 10, code: "lantern",
  stacking: "SINGLE", appliesTo: "ALL", workshopIds: [], startDate: "2030-01-01", endDate: "2030-01-31", enabled: true,
};
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string; details: { fields?: Record<string, string> } } };

beforeEach(() => resetPromotionStore());

describe("GET /promotions", () => {
  it("lists every promotion newest first with today's date and the limit", async () => {
    const res = await list();
    expect(res.items).toHaveLength(14);
    expect(res.today).toBe(shopToday());
    expect(res.limit).toBe(MAX_PROMOTIONS_PER_SHOP);
    const created = res.items.map((p) => p.createdAt);
    expect([...created].sort().reverse()).toEqual(created);
  });
  it("seed data covers every status and both ways of combining", async () => {
    const { items, today } = await list();
    const count = (s: string) => items.filter((p) => promotionStatus(p, today) === s).length;
    expect([count("ACTIVE"), count("SCHEDULED"), count("PAUSED"), count("EXPIRED")]).toEqual([5, 4, 2, 3]);
    expect(new Set(items.map((p) => p.stacking))).toEqual(new Set(["SINGLE", "MULTIPLE"]));
  });
  it("seed data never has more than the allowed number running at once, and is varied", async () => {
    const { items, today } = await list();
    expect(firstOverloadedDay(items, today)).toBeNull();
    expect(items.some((p) => p.imageUrl) && items.some((p) => !p.imageUrl)).toBe(true);
    expect(items.some((p) => p.code) && items.some((p) => !p.code)).toBe(true);
    expect(items.some((p) => p.discountType === "PERCENT") && items.some((p) => p.discountType === "FIXED_AMOUNT")).toBe(true);
    expect(items.some((p) => p.appliesTo === "SELECTED") && items.some((p) => p.appliesTo === "ALL")).toBe(true);
    expect(items.some((p) => p.title.vi)).toBe(true);
    expect(new Set(items.map((p) => p.id)).size).toBe(items.length);
  });
  it("a paused seed promotion cannot be resumed while 5 are running", async () => {
    expect((await PATCH(json("PATCH", { enabled: true }), ctx("pr-13"))).status).toBe(409);
  });
});

describe("POST /promotions", () => {
  it("creates a promotion, upper-cases the code and answers 201", async () => {
    const res = await POST(json("POST", good));
    expect(res.status).toBe(201);
    const p = (await res.json()) as PromotionRecord;
    expect(p).toMatchObject({ discountType: "PERCENT", discountValue: 10, code: "LANTERN", appliesTo: "ALL", workshopIds: [] });
    expect(allPromotions().some((x) => x.id === p.id)).toBe(true);
  });
  it("ignores the workshops of a promotion that applies to all", async () => {
    const p = (await (await POST(json("POST", { ...good, workshopIds: ["ws-1"] }))).json()) as PromotionRecord;
    expect(p.workshopIds).toEqual([]);
  });
  it("answers 422 with a code per field", async () => {
    const res = await POST(json("POST", { ...good, title: {}, discountValue: 150, endDate: "2026-10-01", appliesTo: "SELECTED", workshopIds: [] }));
    expect(res.status).toBe(422);
    const fields = (await errorOf(res)).error.details.fields!;
    expect(fields).toMatchObject({ title: "titleRequired", discountValue: "percentTooHigh", endDate: "endBeforeStart", workshopIds: "workshopRequired" });
    expect(allPromotions()).toHaveLength(14);
  });
  it("refuses a workshop that does not exist", async () => {
    const res = await POST(json("POST", { ...good, appliesTo: "SELECTED", workshopIds: ["nope"] }));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).error.details.fields).toEqual({ workshopIds: "workshopUnknown" });
  });
  it("answers 400 for a body that is not JSON", async () => {
    expect((await POST(json("POST", null, "{nope"))).status).toBe(400);
  });
  it(`answers 409 once the shop has ${MAX_PROMOTIONS_PER_SHOP} promotions`, async () => {
    // Each one runs in its own week, so the limit on promotions running at once does not get in the way.
    const week = (i: number) => {
      const start = new Date(Date.parse("2028-01-01T12:00:00Z") + i * 7 * 86_400_000);
      return { startDate: start.toISOString().slice(0, 10), endDate: new Date(start.getTime() + 3 * 86_400_000).toISOString().slice(0, 10) };
    };
    for (let i = allPromotions().length; i < MAX_PROMOTIONS_PER_SHOP; i++) expect((await POST(json("POST", { ...good, ...week(i) }))).status).toBe(201);
    const res = await POST(json("POST", { ...good, ...week(99) }));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).error.code).toBe("LIMIT_REACHED");
  });
});

describe("PUT, PATCH and DELETE /promotions/{id}", () => {
  it("replaces a promotion and keeps its id and creation time", async () => {
    const before = allPromotions().find((p) => p.id === "pr-1")!;
    const res = await PUT(json("PUT", { ...good, discountValue: 30, appliesTo: "SELECTED", workshopIds: ["ws-1", "ws-1"] }), ctx("pr-1"));
    expect(res.status).toBe(200);
    const p = (await res.json()) as PromotionRecord;
    expect(p).toMatchObject({ id: "pr-1", discountValue: 30, workshopIds: ["ws-1"], createdAt: before.createdAt });
  });
  it("answers 404 for an unknown promotion and 422 for a bad body", async () => {
    expect((await PUT(json("PUT", good), ctx("nope"))).status).toBe(404);
    expect((await PUT(json("PUT", { ...good, discountValue: 0 }), ctx("pr-1"))).status).toBe(422);
    expect((await PATCH(json("PATCH", { enabled: "yes" }), ctx("pr-1"))).status).toBe(422);
    expect((await PATCH(json("PATCH", { enabled: false }), ctx("nope"))).status).toBe(404);
    expect((await DELETE(json("DELETE", null, undefined), ctx("nope"))).status).toBe(404);
  });
  it("pauses and resumes without changing anything else", async () => {
    const before = allPromotions().find((p) => p.id === "pr-1")!;
    const paused = (await (await PATCH(json("PATCH", { enabled: false }), ctx("pr-1"))).json()) as PromotionRecord;
    expect(paused).toMatchObject({ enabled: false, title: before.title, discountValue: before.discountValue });
    expect(publicPromotions().some((p) => p.id === "pr-1")).toBe(false);
    await PATCH(json("PATCH", { enabled: true }), ctx("pr-1"));
    expect(publicPromotions().some((p) => p.id === "pr-1")).toBe(true);
  });
  it("deletes with 204", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), ctx("pr-2"));
    expect(res.status).toBe(204);
    expect(allPromotions().some((p) => p.id === "pr-2")).toBe(false);
  });
});

describe("what guests see", () => {
  it("only the promotions that are active today", () => {
    expect(publicPromotions().map((p) => p.id).sort()).toEqual(["pr-1", "pr-2", "pr-5", "pr-6", "pr-7"]);
  });
  it("follows the dates: a scheduled promotion is shown on its first day, an expired one never", () => {
    const scheduled = allPromotions().find((p) => p.id === "pr-3")!;
    expect(publicPromotions(scheduled.startDate).map((p) => p.id)).toContain("pr-3");
    expect(publicPromotions(scheduled.endDate).map((p) => p.id)).toContain("pr-3");
    const expired = allPromotions().find((p) => p.id === "pr-4")!;
    expect(publicPromotions(expired.startDate).map((p) => p.id)).toContain("pr-4");
    expect(publicPromotions().map((p) => p.id)).not.toContain("pr-4");
  });
});
