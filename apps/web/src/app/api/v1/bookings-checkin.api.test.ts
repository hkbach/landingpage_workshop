import { beforeEach, describe, expect, it } from "vitest";
import { liveBookings, resetBookingStore } from "@/lib/mock/booking-store";
import { PATCH } from "./bookings/[id]/status/route";

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const patch = (id: string, body: unknown) => PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctxId(id));
const at = (id: string) => liveBookings().find((b) => b.id === id)?.checkedInAt;

beforeEach(() => resetBookingStore());

describe("the time of a check-in", () => {
  it("is kept with the check-in, and cleared by an uncheck-in", async () => {
    expect(at("bk-13")).toBeUndefined();
    expect((await patch("bk-13", { status: "CHECKED_IN", checkedInAt: "2026-11-03T09:05:00.000Z" })).status).toBe(200);
    expect(at("bk-13")).toBe("2026-11-03T09:05:00.000Z");
    expect((await patch("bk-13", { status: "CONFIRMED" })).status).toBe(200);
    expect(at("bk-13")).toBeUndefined();
  });
  it("is dropped by a cancel", async () => {
    await patch("bk-14", { status: "CHECKED_IN", checkedInAt: "2026-11-03T09:10:00.000Z" });
    expect(at("bk-14")).toBe("2026-11-03T09:10:00.000Z");
    await patch("bk-14", { status: "CANCELLED", cancelReason: "x" });
    expect(at("bk-14")).toBeUndefined();
  });
  it("the demo guests who were checked in have their time", () => {
    for (const id of ["bk-2", "bk-12", "bk-19", "bk-21"]) expect(at(id), id).toBeDefined();
  });
  it("refuses a time that is not a date", async () => {
    expect((await patch("bk-13", { status: "CHECKED_IN", checkedInAt: "nope" })).status).toBe(422);
  });
});
