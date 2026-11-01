import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sessions } from "@/lib/mock/data";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { allPromotions, resetPromotionStore, shopToday } from "@/lib/mock/promotion-store";
import { POST as createRoute } from "./promotions/route";
import { DELETE, PATCH, PUT } from "./promotions/[id]/route";
import { PATCH as patchBooking } from "./bookings/[id]/status/route";

// Rules between promotions and bookings: pause only when no live booking of a running session uses it, delete only when paused or over,
// and a code is unique inside the shop.

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const req = (method: string, body: unknown) => new Request("http://x/api/v1", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const pause = (id: string) => PATCH(req("PATCH", { enabled: false }), ctxId(id));
const del = (id: string) => DELETE(new Request("http://x", { method: "DELETE" }), ctxId(id));
const cancel = (id: string) => patchBooking(req("PATCH", { status: "CANCELLED", cancelReason: "Instructor ill" }), ctxId(id));
const errorOf = async (res: Response) => (await res.json()) as { error: { code: string; details: { count?: number; bookingCodes?: string[]; fields?: Record<string, string> } } };
const se1 = sessions.find((s) => s.id === "se-1")!;
const hours = (iso: string, n: number) => new Date(Date.parse(iso) + n * 3_600_000);

function body(over: Record<string, unknown> = {}) {
  const today = shopToday();
  return {
    title: { en: "Rule test" }, description: {}, code: "RULETEST", discountType: "PERCENT", discountValue: 5, stacking: "MULTIPLE", appliesTo: "ALL", workshopIds: [],
    startDate: today, endDate: today, enabled: false, ...over,
  };
}

beforeEach(() => {
  resetPromotionStore();
  resetBookingStore();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(hours(se1.startsAt, -1));
});
afterEach(() => vi.useRealTimers());

describe("pausing a promotion that guests use", () => {
  it("is refused while live bookings of sessions that have not ended use it, and names the bookings", async () => {
    const res = await pause("pr-1");
    expect(res.status).toBe(409);
    const err = await errorOf(res);
    expect(err.error.code).toBe("PROMOTION_IN_USE");
    expect(err.error.details.count).toBe(2);
    expect(err.error.details.bookingCodes).toEqual(expect.arrayContaining(["7K3M9QX2", "K5N2Q8RD"]));
    expect(allPromotions().find((p) => p.id === "pr-1")?.enabled).toBe(true);
  });
  it("is refused through PUT as well", async () => {
    const p = allPromotions().find((x) => x.id === "pr-1")!;
    const rest = { ...(p as unknown as Record<string, unknown>) };
    delete rest.id;
    expect((await PUT(req("PUT", { ...rest, enabled: false }), ctxId("pr-1"))).status).toBe(409);
  });
  it("counts a checked-in booking while its session is running, and lets go once the session has ended", async () => {
    vi.setSystemTime(hours(se1.startsAt, 1));
    expect((await pause("pr-5")).status).toBe(409);
    vi.setSystemTime(hours(se1.endsAt, 1));
    for (const id of ["pr-5", "pr-6", "pr-7"]) expect((await pause(id)).status).toBe(200);
  });
  it("after the session only the bookings of later sessions still block", async () => {
    vi.setSystemTime(hours(se1.endsAt, 1));
    const err = await errorOf(await pause("pr-1"));
    expect(err.error.details.bookingCodes).toEqual(["K5N2Q8RD"]);
  });
  it("is allowed once the guests cancel their bookings", async () => {
    expect((await pause("pr-1")).status).toBe(409);
    expect((await cancel("bk-1")).status).toBe(200);
    expect((await cancel("bk-6")).status).toBe(200);
    expect((await pause("pr-1")).status).toBe(200);
  });
});

describe("deleting a promotion", () => {
  it("is refused while it is active, and allowed once it is paused", async () => {
    const res = await del("pr-3");
    expect(res.status).toBe(409);
    expect((await errorOf(res)).error.code).toBe("DELETE_NOT_ALLOWED");
    expect((await pause("pr-3")).status).toBe(200);
    expect((await del("pr-3")).status).toBe(204);
  });
  it("is allowed for a promotion that is over, and answers 404 for an unknown one", async () => {
    expect((await del("pr-4")).status).toBe(204);
    expect((await del("pr-4")).status).toBe(404);
  });
});

describe("promotion code", () => {
  it("is unique inside the shop, whatever the letter case", async () => {
    const taken = allPromotions()[0]!.code;
    for (const code of [taken, taken.toLowerCase()]) {
      const res = await createRoute(req("POST", body({ code })));
      expect(res.status).toBe(422);
      expect((await errorOf(res)).error.details.fields?.code).toBe("codeTaken");
    }
  });
  it("may be kept when the promotion is edited, and is free again after the promotion is deleted", async () => {
    const created = await createRoute(req("POST", body()));
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: string };
    expect((await PUT(req("PUT", body({ title: { en: "Renamed" } })), ctxId(id))).status).toBe(200);
    expect((await createRoute(req("POST", body()))).status).toBe(422);
    expect((await del(id)).status).toBe(204);
    expect((await createRoute(req("POST", body()))).status).toBe(201);
  });
});
