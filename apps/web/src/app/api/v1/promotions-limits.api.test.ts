import { beforeEach, describe, expect, it } from "vitest";
import { MAX_CONCURRENT_PROMOTIONS, type PromotionRecord } from "@workshop/shared";
import { allPromotions, resetPromotionStore, shopToday } from "@/lib/mock/promotion-store";
import { MAX_IMAGE_BYTES } from "@/lib/mock/media-store";
import { GET as listPromotions, POST as createRoute } from "./promotions/route";
import { DELETE, PATCH, PUT } from "./promotions/[id]/route";
import { POST as uploadImage } from "./media/promotions/route";
import { GET as serveImage } from "./media/promotions/[id]/route";

// The rules added to promotions: one image each, at most 5 running at once, and a combine setting for each promotion.

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/yQALCAABAAEBAREA/8wABgAQEAX/2gAIAQEAAD8A0s8g/9k=";
const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const req = (method: string, body: unknown, raw?: string) => new Request("http://x/api/v1", { method, headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body) });
const upload = (dataUrl: unknown) => uploadImage(req("POST", { dataUrl }));
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

function body(over: Record<string, unknown> = {}) {
  const today = shopToday();
  return {
    title: { en: "Flash" }, description: {}, code: "FLASH10", discountType: "PERCENT", discountValue: 10, stacking: "SINGLE", appliesTo: "ALL", workshopIds: [],
    startDate: addDays(today, 300), endDate: addDays(today, 305), enabled: true, ...over,
  };
}
const create = (over: Record<string, unknown> = {}) => createRoute(req("POST", body(over)));
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string; details: Record<string, unknown> & { fields?: Record<string, string> } } };

beforeEach(() => resetPromotionStore());

describe("one image per promotion", () => {
  it("stores an uploaded image and serves it with its type, for everyone", async () => {
    const res = await upload(PNG);
    expect(res.status).toBe(201);
    const { id, url } = (await res.json()) as { id: string; url: string };
    expect(url).toBe(`/api/v1/media/promotions/${id}`);
    const img = await serveImage(new Request("http://x"), ctxId(id));
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(img.headers.get("x-content-type-options")).toBe("nosniff");
    expect(img.headers.get("cache-control")).toContain("immutable");
    expect((await img.arrayBuffer()).byteLength).toBeGreaterThan(20);
  });
  it("accepts JPEG too, and answers 404 for an unknown image", async () => {
    expect((await upload(JPEG)).status).toBe(201);
    expect((await serveImage(new Request("http://x"), ctxId("00000000-0000-0000-0000-000000000000"))).status).toBe(404);
  });
  it("refuses what is not a real jpeg, png or webp image", async () => {
    for (const bad of [123, "", "not a data url", "data:text/html;base64,PGI+aGk8L2I+", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=", "data:image/png;base64,aGVsbG8gd29ybGQ="]) {
      const res = await upload(bad);
      expect(res.status, String(bad)).toBe(422);
    }
    expect((await uploadImage(req("POST", null, "{nope"))).status).toBe(400);
  });
  it("answers 413 for an image above the limit", async () => {
    const big = `data:image/png;base64,${Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(MAX_IMAGE_BYTES + 10)]).toString("base64")}`;
    const res = await upload(big);
    expect(res.status).toBe(413);
    expect((await errorOf(res)).error.code).toBe("IMAGE_TOO_LARGE");
  });
  it("attaches the uploaded image to a promotion, or an https image", async () => {
    const { url } = (await (await upload(PNG)).json()) as { url: string };
    const p = (await (await create({ imageUrl: url })).json()) as PromotionRecord;
    expect(p.imageUrl).toBe(url);
    const q = (await (await create({ imageUrl: "https://cdn.example.com/a.webp", startDate: addDays(shopToday(), 100), endDate: addDays(shopToday(), 101) })).json()) as PromotionRecord;
    expect(q.imageUrl).toBe("https://cdn.example.com/a.webp");
  });
  it("refuses an image that was never uploaded, and any other kind of address", async () => {
    const missing = await create({ imageUrl: "/api/v1/media/promotions/3f2c9a10-aaaa-bbbb-cccc-000000000000" });
    expect(missing.status).toBe(422);
    expect((await errorOf(missing)).error.details.fields).toEqual({ imageUrl: "imageInvalid" });
    for (const bad of ["http://x.com/a.png", "javascript:alert(1)", "data:image/png;base64,AAAA"]) expect((await create({ imageUrl: bad })).status, bad).toBe(422);
  });
  it("drops the image when it is replaced or the promotion is deleted", async () => {
    const first = (await (await upload(PNG)).json()) as { id: string; url: string };
    const second = (await (await upload(JPEG)).json()) as { id: string; url: string };
    const p = (await (await create({ imageUrl: first.url })).json()) as PromotionRecord;
    expect((await PUT(req("PUT", body({ imageUrl: second.url })), ctxId(p.id))).status).toBe(200);
    expect((await serveImage(new Request("http://x"), ctxId(first.id))).status).toBe(404);
    expect((await serveImage(new Request("http://x"), ctxId(second.id))).status).toBe(200);
    expect((await DELETE(new Request("http://x", { method: "DELETE" }), ctxId(p.id))).status).toBe(204);
    expect((await serveImage(new Request("http://x"), ctxId(second.id))).status).toBe(404);
  });
  it("shows no image when none was chosen", async () => {
    const p = (await (await create()).json()) as PromotionRecord;
    expect(p.imageUrl).toBeUndefined();
  });
});

describe(`at most ${MAX_CONCURRENT_PROMOTIONS} promotions run at the same time`, () => {
  const NOW = { startDate: shopToday(), endDate: addDays(shopToday(), 5) };
  const running = () => allPromotions().filter((p) => p.enabled && p.startDate <= shopToday() && shopToday() <= p.endDate).length;
  // The seed already has the maximum running; pause three of them so these tests start from 2 running.
  beforeEach(async () => {
    for (const id of ["pr-5", "pr-6", "pr-7"]) await PATCH(req("PATCH", { enabled: false }), ctxId(id));
  });

  it("the seed has exactly 5 running, so one more is refused until another is paused", async () => {
    resetPromotionStore();
    expect(running()).toBe(5);
    expect((await create(NOW)).status).toBe(409);
    await PATCH(req("PATCH", { enabled: false }), ctxId("pr-7"));
    expect((await create(NOW)).status).toBe(201);
  });
  it("allows up to 5 and refuses the 6th with the day it would happen", async () => {
    expect(running()).toBe(2);
    for (let i = 0; i < 3; i++) expect((await create(NOW)).status).toBe(201);
    expect(running()).toBe(5);
    const res = await create(NOW);
    expect(res.status).toBe(409);
    const { error } = await errorOf(res);
    expect(error.code).toBe("CONCURRENT_LIMIT");
    expect(error.details).toMatchObject({ date: shopToday(), max: 5 });
    expect(allPromotions()).toHaveLength(17);
  });
  it("counts scheduled promotions that overlap, not only the ones running today", async () => {
    const today = shopToday();
    // pr-3 (starts in 14 days) overlaps pr-1 until day +20: three more on those days make 5 together
    for (let i = 0; i < 3; i++) expect((await create({ startDate: addDays(today, 15), endDate: addDays(today, 18) })).status).toBe(201);
    const res = await create({ startDate: addDays(today, 16), endDate: addDays(today, 17) });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).error.details.date).toBe(addDays(today, 16));
  });
  it("allows many promotions that follow each other", async () => {
    const today = shopToday();
    for (let i = 0; i < 5; i++) expect((await create({ startDate: addDays(today, 100 + i * 10), endDate: addDays(today, 104 + i * 10) })).status).toBe(201);
  });
  it("does not count paused promotions, and refuses to resume one that would be the 6th", async () => {
    for (let i = 0; i < 3; i++) await create(NOW);
    const paused = (await (await create({ ...NOW, enabled: false })).json()) as PromotionRecord;
    expect(paused.enabled).toBe(false);
    const res = await PATCH(req("PATCH", { enabled: true }), ctxId(paused.id));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).error.code).toBe("CONCURRENT_LIMIT");
    expect(allPromotions().find((p) => p.id === paused.id)?.enabled).toBe(false);
    expect((await PATCH(req("PATCH", { enabled: false }), ctxId("pr-1"))).status).toBe(200); // pausing is always fine
    expect((await PATCH(req("PATCH", { enabled: true }), ctxId(paused.id))).status).toBe(200);
  });
  it("refuses an edit that stretches a promotion over a full period", async () => {
    const today = shopToday();
    for (let i = 0; i < 3; i++) await create(NOW);
    const later = (await (await create({ startDate: addDays(today, 40), endDate: addDays(today, 42) })).json()) as PromotionRecord;
    const res = await PUT(req("PUT", body({ startDate: today, endDate: addDays(today, 42) })), ctxId(later.id));
    expect(res.status).toBe(409);
    expect(allPromotions().find((p) => p.id === later.id)?.startDate).toBe(addDays(today, 40));
  });
  it("does not count promotions that are over", async () => {
    const today = shopToday();
    for (let i = 0; i < 6; i++) expect((await create({ startDate: addDays(today, -40), endDate: addDays(today, -35) })).status).toBe(201);
  });
});

describe("how each promotion can be combined", () => {
  it("is part of every promotion, and is required when creating one", async () => {
    const { items } = (await (await listPromotions()).json()) as { items: PromotionRecord[] };
    expect(items.every((p) => p.stacking === "SINGLE" || p.stacking === "MULTIPLE")).toBe(true);
    const res = await create({ stacking: undefined, startDate: addDays(shopToday(), 200), endDate: addDays(shopToday(), 201) });
    expect(res.status).toBe(422);
    expect((await errorOf(res)).error.details.fields).toMatchObject({ stacking: "required" });
    expect((await create({ stacking: "ALL", startDate: addDays(shopToday(), 200), endDate: addDays(shopToday(), 201) })).status).toBe(422);
  });
  it("is saved with the promotion and can be changed later", async () => {
    const far = { startDate: addDays(shopToday(), 200), endDate: addDays(shopToday(), 201) };
    const p = (await (await create({ stacking: "MULTIPLE", ...far })).json()) as PromotionRecord;
    expect(p.stacking).toBe("MULTIPLE");
    const q = (await (await PUT(req("PUT", body({ stacking: "SINGLE", ...far })), ctxId(p.id))).json()) as PromotionRecord;
    expect(q.stacking).toBe("SINGLE");
    expect(allPromotions().find((x) => x.id === p.id)?.stacking).toBe("SINGLE");
  });
  it("there is no shop-wide setting any more, and the list only tells the limits", async () => {
    const res = (await (await listPromotions()).json()) as Record<string, unknown>;
    expect(res).toMatchObject({ maxConcurrent: 5, limit: 20 });
    expect(res.stacking).toBeUndefined();
  });
});
