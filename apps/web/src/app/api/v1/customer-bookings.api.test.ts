import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canGuestCancel, liveBookings, liveCustomers, resetBookingStore } from "@/lib/mock/booking-store";
import { resetOutbox } from "@/lib/mock/outbox-store";
import type { CustomerBooking } from "@/lib/customer-bookings";
import { GET } from "./customer/[id]/bookings/route";
import { POST as cancel } from "./public/sites/[slug]/bookings/cancel/route";

// My Booking of the guest area: the bookings of the guest and only theirs, with the same access as the profile.

const get = (id: string, email?: string) => GET(new Request("http://x", { headers: email === undefined ? {} : { "x-guest-email": email } }), { params: Promise.resolve({ id }) } as never);
const body = async (res: Response) => (await res.json()) as { bookings: CustomerBooking[]; now: string };
const EMMA = "emma@example.com";

beforeEach(() => { resetBookingStore(); resetOutbox(); vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "true"); });
afterEach(() => vi.unstubAllEnvs());

describe("GET /customer/{id}/bookings", () => {
  it("gives the bookings of the guest, with the time of the server", async () => {
    const res = await get("cu-1", EMMA);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const { bookings, now } = await body(res);
    const mine = liveBookings().filter((b) => b.customerId === "cu-1");
    expect(bookings).toHaveLength(mine.length);
    expect(bookings.map((b) => b.code).sort()).toEqual(mine.map((b) => b.bookingCode).sort());
    expect(Math.abs(Date.parse(now) - Date.now())).toBeLessThan(60_000);
  });
  it("only theirs: no booking of another customer", async () => {
    const { bookings } = await body(await get("cu-1", EMMA));
    const others = new Set(liveBookings().filter((b) => b.customerId !== "cu-1").map((b) => b.bookingCode));
    expect(bookings.some((b) => others.has(b.code))).toBe(false);
  });
  it("shows what a guest needs of each booking: the workshop with its picture, the time, the guests, the price and the shop", async () => {
    const { bookings } = await body(await get("cu-1", EMMA));
    const b = bookings.find((x) => x.vouchers.length > 0) ?? bookings[0]!;
    expect(b).toMatchObject({ workshopTitle: expect.any(Object), startsAt: expect.any(String), endsAt: expect.any(String), timezone: "Asia/Ho_Chi_Minh", quantity: expect.any(Number), currency: "VND", totalAmount: expect.any(Number) });
    expect(b.shop).toMatchObject({ slug: "whiskladle", name: "Whisk & Ladle Kitchen" });
    expect(bookings.some((x) => x.coverUrl)).toBe(true);
    const withVoucher = bookings.find((x) => x.discountAmount > 0)!;
    expect(withVoucher.vouchers.length).toBeGreaterThan(0); // the codes, e.g. EARLY20
  });
  it("does not give what is not the guest's to see: no payments, no ids of the customer", async () => {
    const text = JSON.stringify(await body(await get("cu-1", EMMA)));
    for (const word of ["customerId", "payments", "recordedBy", "statusBeforeCheckIn"]) expect(text, word).not.toContain(word);
  });
  it("says what the guest can cancel, as the server rules (until the session starts)", async () => {
    const { bookings, now } = await body(await get("cu-1", EMMA));
    for (const b of bookings) {
      const row = liveBookings().find((x) => x.id === b.id)!;
      expect(b.canCancel, b.code).toBe(canGuestCancel(row, new Date(now)));
      if (b.status === "CANCELLED" || b.status === "CHECKED_IN") expect(b.canCancel, b.code).toBe(false);
      if (Date.parse(b.startsAt) <= Date.parse(now)) expect(b.canCancel, b.code).toBe(false);
    }
    expect(bookings.some((b) => b.canCancel)).toBe(true);
  });
  it("after the guest cancels, the booking is cancelled, with who and why", async () => {
    const { bookings } = await body(await get("cu-1", EMMA));
    const target = bookings.find((b) => b.canCancel)!;
    const res = await cancel(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: target.code, email: EMMA, reason: "Cannot come" }) }), { params: Promise.resolve({ slug: "whiskladle" }) } as never);
    expect(res.status).toBe(200);
    const after = (await body(await get("cu-1", EMMA))).bookings.find((b) => b.id === target.id)!;
    expect(after).toMatchObject({ status: "CANCELLED", cancelledBy: "GUEST", cancelReason: "Cannot come", canCancel: false });
  });
  it("is the same 404 for a missing email, a wrong email, an unknown id and a customer without an account", async () => {
    const answers = [await get("cu-1"), await get("cu-1", "someone.else@example.com"), await get("cu-nope", EMMA), await get("cu-2", "minjun@example.com"), await get("cu-1", "thu@example.com")];
    for (const a of answers) expect(a.status).toBe(404);
    const bodies = await Promise.all(answers.map((a) => a.json()));
    for (const b of bodies) expect(b).toEqual(bodies[0]);
  });
  it("a guest who registered gets the bookings made before with the same email (merged into the account)", async () => {
    const minjun = liveCustomers().find((c) => c.email === "minjun@example.com")!;
    expect(minjun.account).toBeUndefined(); // no account yet: nothing to open
    expect((await get(minjun.id, "minjun@example.com")).status).toBe(404);
  });
});

describe("with the login switched off (testing only)", () => {
  beforeEach(() => vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "false"));
  it("the id alone gives the bookings; an unknown id or a customer without an account is still 404; in production it is always on", async () => {
    expect((await get("cu-1")).status).toBe(200);
    expect((await get("cu-nope")).status).toBe(404);
    expect((await get("cu-2")).status).toBe(404);
    vi.stubEnv("NODE_ENV", "production");
    expect((await get("cu-1")).status).toBe(404);
  });
});
