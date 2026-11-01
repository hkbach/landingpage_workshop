import { beforeEach, describe, expect, it } from "vitest";
import { fullDiscountWorkshops, type PromotionRecord } from "@workshop/shared";
import { releaseAllBookings, resetBookingStore } from "@/lib/mock/booking-store";
import { workshops } from "@/lib/mock/data";
import { allPromotions, resetPromotionStore, shopToday } from "@/lib/mock/promotion-store";
import { POST } from "./promotions/route";
import { PATCH, PUT } from "./promotions/[id]/route";

// A promotion may never let a guest get a workshop for nothing (100% off), alone or next to the others.

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const req = (method: string, body: unknown) => new Request("http://x/api/v1", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const FAR = () => ({ startDate: addDays(shopToday(), 300), endDate: addDays(shopToday(), 305) });
const TODAY = () => ({ startDate: shopToday(), endDate: addDays(shopToday(), 5) });
let codeCounter = 0; // every promotion of a shop needs its own code
const body = (over: Record<string, unknown> = {}) => ({
  title: { en: "Free test" }, description: {}, code: `FT${++codeCounter}X`, discountType: "PERCENT", discountValue: 10, stacking: "SINGLE", appliesTo: "ALL", workshopIds: [],
  ...FAR(), enabled: true, ...over,
});
const create = (over: Record<string, unknown> = {}) => POST(req("POST", body(over)));
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string; message: string; details: { fields?: Record<string, string>; workshopIds?: string[] } } };
const ids = (r: { error: { details: { workshopIds?: string[] } } }) => [...(r.error.details.workshopIds ?? [])].sort();

// The demo bookings use promotions, which stops them from being paused: these tests start with every booking cancelled.
beforeEach(() => { resetPromotionStore(); resetBookingStore(); releaseAllBookings(); });

describe("a promotion that makes a workshop free is refused", () => {
  it("100% off: 422 FULL_DISCOUNT with the workshops that would be free, and nothing is saved", async () => {
    const res = await create({ discountValue: 100 });
    expect(res.status).toBe(422);
    const e = await errorOf(res);
    expect(e.error.code).toBe("FULL_DISCOUNT");
    expect(e.error.details.fields).toEqual({ discountValue: "fullDiscount" });
    expect(ids(e)).toEqual(workshops.map((w) => w.id).sort());
    expect(allPromotions()).toHaveLength(14);
  });
  it("99% off is allowed (the page only warns)", async () => {
    expect((await create({ discountValue: 99 })).status).toBe(201);
  });
  it("a fixed amount that covers a workshop's whole price is refused for that workshop only", async () => {
    const ws2 = workshops.find((w) => w.id === "ws-2")!.priceAmount; // 400,000
    const res = await create({ discountType: "FIXED_AMOUNT", discountValue: ws2 });
    expect(res.status).toBe(422);
    expect(ids(await errorOf(res))).toContain("ws-2");
    expect(ids(await errorOf(await create({ discountType: "FIXED_AMOUNT", discountValue: ws2 })))).not.toContain("ws-1");
    expect((await create({ discountType: "FIXED_AMOUNT", discountValue: ws2 - 1 })).status).toBe(201);
  });
  it("only the workshops the promotion covers count", async () => {
    const price = workshops.find((w) => w.id === "ws-2")!.priceAmount;
    expect((await create({ discountType: "FIXED_AMOUNT", discountValue: price, appliesTo: "SELECTED", workshopIds: ["ws-1"] })).status).toBe(201);
    const res = await create({ discountType: "FIXED_AMOUNT", discountValue: price, appliesTo: "SELECTED", workshopIds: ["ws-2"], ...{ startDate: addDays(shopToday(), 400), endDate: addDays(shopToday(), 401) } });
    expect(res.status).toBe(422);
    expect(ids(await errorOf(res))).toEqual(["ws-2"]);
  });
  it("amounts that can be combined add up with the promotions already running on the same days", async () => {
    // Leave pr-1 and pr-5 running (pr-5 takes 150,000 off ws-1 and can be combined): below the limit of 5 running at once.
    for (const id of ["pr-2", "pr-6", "pr-7"]) await PATCH(req("PATCH", { enabled: false }), ctxId(id));
    const price = workshops.find((w) => w.id === "ws-1")!.priceAmount; // 650,000
    const fixedFor = (value: number) => ({ ...TODAY(), discountType: "FIXED_AMOUNT", discountValue: value, stacking: "MULTIPLE", appliesTo: "SELECTED", workshopIds: ["ws-1"] });
    const refused = await create(fixedFor(price - 150_000)); // 150,000 + 500,000 = the whole price
    expect(refused.status).toBe(422);
    const e = await errorOf(refused);
    expect(e.error.code).toBe("FULL_DISCOUNT");
    expect(ids(e)).toEqual(["ws-1"]);
    expect((await create(fixedFor(price - 150_001))).status).toBe(201); // one unit short of free
  });
  it("amounts that cannot be combined do not add up", async () => {
    for (const id of ["pr-6", "pr-7", "pr-2"]) await PATCH(req("PATCH", { enabled: false }), ctxId(id));
    const price = workshops.find((w) => w.id === "ws-1")!.priceAmount;
    expect((await create({ ...TODAY(), discountType: "FIXED_AMOUNT", discountValue: price - 150_000, stacking: "SINGLE", appliesTo: "SELECTED", workshopIds: ["ws-1"] })).status).toBe(201);
  });
  it("promotions on other days do not add up", async () => {
    const price = workshops.find((w) => w.id === "ws-1")!.priceAmount;
    expect((await create({ discountType: "FIXED_AMOUNT", discountValue: price - 1, stacking: "MULTIPLE", appliesTo: "SELECTED", workshopIds: ["ws-1"] })).status).toBe(201);
    expect((await create({ discountType: "FIXED_AMOUNT", discountValue: price - 1, stacking: "MULTIPLE", appliesTo: "SELECTED", workshopIds: ["ws-1"], startDate: addDays(shopToday(), 500), endDate: addDays(shopToday(), 505) })).status).toBe(201);
  });
});

describe("editing", () => {
  it("is refused when the new discount would make a workshop free, and the saved promotion stays as it was", async () => {
    await PATCH(req("PATCH", { enabled: false }), ctxId("pr-1")); // an active promotion is edited only after it is paused
    const before = allPromotions().find((p) => p.id === "pr-1")!;
    const res = await PUT(req("PUT", body({ ...TODAY(), discountValue: 100, code: "EARLY20" })), ctxId("pr-1"));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).error.code).toBe("FULL_DISCOUNT");
    expect(allPromotions().find((p) => p.id === "pr-1")).toEqual(before);
  });
  it("is allowed when it stays below 100%, and the saved version of the same promotion is not counted twice", async () => {
    await PATCH(req("PATCH", { enabled: false }), ctxId("pr-1")); // an active promotion is edited only after it is paused
    const res = await PUT(req("PUT", body({ ...TODAY(), discountValue: 25, code: "EARLY25" })), ctxId("pr-1"));
    expect(res.status).toBe(200);
    expect(((await res.json()) as PromotionRecord).discountValue).toBe(25);
  });
});

describe("paused and resumed promotions", () => {
  it("a paused promotion can be saved even at 100%: it is not running", async () => {
    const res = await create({ discountValue: 100, enabled: false });
    expect(res.status).toBe(201);
  });
  it("but it cannot be resumed: resuming is like adding it", async () => {
    const p = (await (await create({ discountValue: 100, enabled: false })).json()) as PromotionRecord;
    const res = await PATCH(req("PATCH", { enabled: true }), ctxId(p.id));
    expect(res.status).toBe(422);
    expect((await errorOf(res)).error.code).toBe("FULL_DISCOUNT");
    expect(allPromotions().find((x) => x.id === p.id)?.enabled).toBe(false);
  });
  it("pausing is always allowed", async () => {
    expect((await PATCH(req("PATCH", { enabled: false }), ctxId("pr-1"))).status).toBe(200);
  });
});

describe("the demo promotions", () => {
  it("never let a guest get a workshop for nothing", () => {
    const all = allPromotions();
    const shopWorkshops = workshops.filter((w) => w.status !== "ARCHIVED");
    for (const p of all) expect(fullDiscountWorkshops(p, all.filter((o) => o.id !== p.id), shopWorkshops), p.id).toEqual([]);
  });
});
