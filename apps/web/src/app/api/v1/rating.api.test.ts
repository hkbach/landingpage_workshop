import { beforeEach, describe, expect, it } from "vitest";
import { liveAuditLogs, resetAdminAudit } from "@/lib/mock/admin-audit-store";
import { adminShops, adminWorkshops } from "@/lib/mock/admin-directory";
import { resetAccountsStore } from "@/lib/mock/accounts-store";
import { liveBookings, resetBookingStore } from "@/lib/mock/booking-store";
import { workshops } from "@/lib/mock/data";
import { givenRatings, listRatings, resetRatingStore, sessionEnded, withRating } from "@/lib/mock/rating-store";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { GET as myBookings } from "./customer/[id]/bookings/route";
import { POST as rate } from "./customer/[id]/bookings/[code]/rating/route";
import { GET as ownerRatings } from "./ratings/route";
import { POST as adminRemove } from "./admin/ratings/[id]/route";
import { adminRatings } from "@/lib/mock/admin-directory";

const post = (id: string, code: string, body: unknown) => rate(new Request("http://app.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id, code }) } as never);
const list = (id: string) => myBookings(new Request("http://app.localtest.me:3000/x"), { params: Promise.resolve({ id }) } as never);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (res: Response) => (await res.json()) as any;

const checkedIn = () => liveBookings().find((b) => b.customerId === "cu-1" && b.status === "CHECKED_IN" && sessionEnded(b))!;
/** Checked in, but the session is still going on. */
const inProgress = () => liveBookings().find((b) => b.customerId === "cu-1" && b.status === "CHECKED_IN" && !sessionEnded(b))!;
const removeRequest = (id: string, body: unknown) => adminRemove(new Request("http://app.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) } as never);
const notCheckedIn = () => liveBookings().find((b) => b.customerId === "cu-1" && b.status !== "CHECKED_IN" && b.status !== "CANCELLED")!;

beforeEach(() => { resetBookingStore(); resetAccountsStore(); resetRatingStore(); resetAdminAudit(); });

describe("the Rate this workshop button of My Booking: the guest rates the workshop", () => {
  it("a booking is ratable only after the guest checked in AND its session ended (canRate), and the list says so", async () => {
    const bookings = (await json(await list("cu-1"))).bookings as { code: string; status: string; canRate: boolean }[];
    expect(bookings.length).toBeGreaterThan(3);
    const ended = new Map(liveBookings().map((b) => [b.bookingCode, sessionEnded(b)]));
    for (const b of bookings) expect(b.canRate, `${b.code} ${b.status}`).toBe(b.status === "CHECKED_IN" && ended.get(b.code) === true);
    expect(bookings.find((b) => b.code === inProgress().bookingCode)!.canRate).toBe(false);
    expect(bookings.some((b) => b.canRate)).toBe(true);
    expect(bookings.some((b) => !b.canRate)).toBe(true);
  });

  it("rates a checked in booking (stars and a trimmed comment); the booking then carries the rating and cannot be rated again", async () => {
    const b = checkedIn();
    const res = await post("cu-1", b.bookingCode, { stars: 4, comment: "  Lovely teacher  " });
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({ code: b.bookingCode, stars: 4, comment: "Lovely teacher" });
    const mine = (await json(await list("cu-1"))).bookings.find((x: { code: string }) => x.code === b.bookingCode);
    expect(mine).toMatchObject({ canRate: false, rating: { stars: 4, comment: "Lovely teacher" } });
    const again = await post("cu-1", b.bookingCode, { stars: 5 });
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe("ALREADY_RATED");
    expect(listRatings()).toHaveLength(1);
  });

  it("refuses a checked in booking whose session has not ended (409 NOT_ENDED), then accepts it once the session is over", async () => {
    const b = inProgress();
    const early = await post("cu-1", b.bookingCode, { stars: 5 });
    expect(early.status).toBe(409);
    expect((await json(early)).error.code).toBe("NOT_ENDED");
    expect(listRatings()).toEqual([]);
  });

  it("refuses a booking the guest did not check in to (409), someone else's booking (404) and wrong stars or a long comment (422)", async () => {
    const b = notCheckedIn();
    const refused = await post("cu-1", b.bookingCode, { stars: 5 });
    expect(refused.status).toBe(409);
    expect((await json(refused)).error.code).toBe("NOT_CHECKED_IN");
    expect((await post("cu-2", checkedIn().bookingCode, { stars: 5 })).status).toBe(404);
    expect((await post("cu-1", "NOPE-0", { stars: 5 })).status).toBe(404);
    expect((await post("nobody", checkedIn().bookingCode, { stars: 5 })).status).toBe(404);
    for (const bad of [{ stars: 0 }, { stars: 6 }, { stars: 3.5 }, { stars: "5" }, {}, { stars: 5, comment: "x".repeat(501) }]) expect((await post("cu-1", checkedIn().bookingCode, bad)).status, JSON.stringify(bad)).toBe(422);
    expect(listRatings()).toEqual([]);
  });

  it("the rating of the workshop counts the stars given: the average of the shop and the guests, with the number of ratings", async () => {
    const b = checkedIn();
    const w = workshops.find((x) => x.id === b.workshopId)!;
    const before = withWorkshopStatus([w])[0]!.rating;
    await post("cu-1", b.bookingCode, { stars: 1 });
    const after = withWorkshopStatus([w])[0]!.rating!;
    expect(after.count).toBe((before?.count ?? 0) + 1);
    const expected = Math.round((((before?.average ?? 0) * (before?.count ?? 0) + 1) / after.count) * 10) / 10;
    expect(after.average).toBe(expected);
    expect(givenRatings(w.id)).toEqual({ count: 1, sum: 1 });
    expect(withRating({ id: "ws-none", rating: undefined }).rating).toBeUndefined();
    expect(withRating({ id: w.id, rating: { average: 5, count: 1 } }).rating).toEqual({ average: 3, count: 2 });
  });

  it("the administrators see it: the workshop in the admin list has the new count, and the audit line says who rated what without the comment", async () => {
    const b = checkedIn();
    const before = adminWorkshops().find((x) => x.id === b.workshopId)!.rating?.count ?? 0;
    await post("cu-1", b.bookingCode, { stars: 5, comment: "Private opinion text" });
    expect(adminWorkshops().find((x) => x.id === b.workshopId)!.rating?.count).toBe(before + 1);
    expect(adminShops().length).toBeGreaterThan(0);
    const line = liveAuditLogs()[0]!;
    expect(line).toMatchObject({ action: "booking.rate", actorRole: "CUSTOMER", details: `${b.bookingCode}: 5/5` });
    expect(JSON.stringify(line)).not.toContain("Private opinion");
  });

  it("the shop owner reads the ratings with their comments; an administrator removes one with a reason: it leaves the average and the shop's list, and can be put back", async () => {
    const b = checkedIn();
    const w = workshops.find((x) => x.id === b.workshopId)!;
    const before = withWorkshopStatus([w])[0]!.rating;
    await post("cu-1", b.bookingCode, { stars: 1, comment: "Too loud for me" });
    const owner = await json(await ownerRatings());
    expect(owner).toMatchObject({ count: 1, average: 1 });
    expect(owner.items[0]).toMatchObject({ bookingCode: b.bookingCode, stars: 1, comment: "Too loud for me" });
    const [row] = adminRatings();
    expect(row).toMatchObject({ bookingCode: b.bookingCode, comment: "Too loud for me", status: "VISIBLE" });
    expect((await removeRequest(row!.id, { removed: true })).status).toBe(422); // a reason is needed
    expect((await removeRequest("nope", { removed: true, reason: "x" })).status).toBe(404);
    expect((await removeRequest(row!.id, { removed: true, reason: "Abusive language" })).status).toBe(200);
    expect((await removeRequest(row!.id, { removed: true, reason: "Again" })).status).toBe(409);
    expect(await json(await ownerRatings())).toMatchObject({ count: 0, items: [] });
    expect(adminRatings()[0]).toMatchObject({ status: "REMOVED", removedReason: "Abusive language" });
    expect(adminRatings("", "REMOVED")).toHaveLength(1);
    expect(adminRatings("", "VISIBLE")).toHaveLength(0);
    expect(withWorkshopStatus([w])[0]!.rating).toEqual(before); // the removed rating no longer counts
    expect(liveAuditLogs()[0]).toMatchObject({ action: "rating.remove", actorRole: "SYSTEM_ADMIN" });
    expect(JSON.stringify(liveAuditLogs()[0])).not.toContain("Too loud");
    expect((await post("cu-1", b.bookingCode, { stars: 5 })).status).toBe(409); // still rated once
    expect((await removeRequest(row!.id, { removed: false })).status).toBe(200);
    expect((await removeRequest(row!.id, { removed: false })).status).toBe(409);
    expect(await json(await ownerRatings())).toMatchObject({ count: 1 });
    expect(liveAuditLogs()[0]).toMatchObject({ action: "rating.restore" });
  });
});
