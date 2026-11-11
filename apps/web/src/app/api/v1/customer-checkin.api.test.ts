import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKIN_OPENS_MINUTES, type CustomerBooking } from "@/lib/customer-bookings";
import { canGuestCheckIn, checkInByGuest, liveBookings, liveSession, resetBookingStore } from "@/lib/mock/booking-store";
import { resetOutbox } from "@/lib/mock/outbox-store";
import { GET as list } from "./customer/[id]/bookings/route";
import { POST as checkIn } from "./customer/[id]/bookings/[code]/check-in/route";

// A guest checks themselves in to a booking from My Booking: confirmed, from an hour before the workshop starts until it ends, while its session is not closed.

const EMMA = "emma@example.com";
const MIN = 60_000;
const call = (id: string, code: string, email?: string) =>
  checkIn(new Request("http://x", { method: "POST", headers: email === undefined ? {} : { "x-guest-email": email } }), { params: Promise.resolve({ id, code }) } as never);
const mine = (id: string, email: string) => list(new Request("http://x", { headers: { "x-guest-email": email } }), { params: Promise.resolve({ id }) } as never).then((r) => r.json() as Promise<{ bookings: CustomerBooking[] }>);

/** A confirmed booking of Emma whose session is still open to guests at the given time, and the time of its start. */
function candidate() {
  const found = liveBookings().find((b) => b.customerId === "cu-1" && b.status === "CONFIRMED" && Date.parse(b.startsAt) > Date.now() + 2 * 60 * MIN && (() => { const s = liveSession(b.sessionId, new Date(Date.parse(b.startsAt) - 30 * MIN)); return !!s && s.status !== "CLOSED" && s.status !== "COMPLETED"; })());
  if (!found) throw new Error("the demo data has no upcoming confirmed booking of Emma");
  return found;
}

beforeEach(() => { resetBookingStore(); resetOutbox(); vi.stubEnv("CUSTOMER_LOGIN_REQUIRED", "true"); vi.useFakeTimers({ toFake: ["Date"] }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("when a guest can check in", () => {
  it("not before the check-in opens, from an hour before the start, until the workshop ends", () => {
    const b = candidate();
    const start = Date.parse(b.startsAt);
    expect(canGuestCheckIn(b, new Date(start - (CHECKIN_OPENS_MINUTES + 1) * MIN))).toBe(false);
    expect(canGuestCheckIn(b, new Date(start - CHECKIN_OPENS_MINUTES * MIN))).toBe(true);
    expect(canGuestCheckIn(b, new Date(start + 5 * MIN))).toBe(true);
    expect(canGuestCheckIn(b, new Date(Date.parse(b.endsAt)))).toBe(false); // over
  });
  it("only a confirmed booking: not one that waits for the link of the email, one that is checked in, or one that was cancelled", () => {
    const b = candidate();
    const t = new Date(Date.parse(b.startsAt) - 10 * MIN);
    for (const status of ["NOT_CONFIRMED", "CHECKED_IN", "CANCELLED"] as const) expect(canGuestCheckIn({ ...b, status }, t), status).toBe(false);
  });
});

describe("POST /customer/{id}/bookings/{code}/check-in", () => {
  it("checks the guest in when it is time: the booking becomes Checked in, with the time", async () => {
    const b = candidate();
    vi.setSystemTime(new Date(Date.parse(b.startsAt) - 20 * MIN));
    const res = await call("cu-1", b.bookingCode, EMMA);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ code: b.bookingCode, status: "CHECKED_IN", checkedInAt: new Date(Date.now()).toISOString() });
    const after = liveBookings().find((x) => x.id === b.id)!;
    expect(after.status).toBe("CHECKED_IN");
    expect(after.statusBeforeCheckIn).toBe("CONFIRMED"); // the shop can still undo it
  });
  it("is refused (409) before it opens, and a second time", async () => {
    const b = candidate();
    vi.setSystemTime(new Date(Date.parse(b.startsAt) - 3 * 60 * MIN));
    expect((await call("cu-1", b.bookingCode, EMMA)).status).toBe(409);
    expect(liveBookings().find((x) => x.id === b.id)!.status).toBe("CONFIRMED");
    vi.setSystemTime(new Date(Date.parse(b.startsAt) - 5 * MIN));
    expect((await call("cu-1", b.bookingCode, EMMA)).status).toBe(200);
    expect((await call("cu-1", b.bookingCode, EMMA)).status).toBe(409); // already checked in
  });
  it("404 for a booking that is not theirs, an unknown code, and a wrong email", async () => {
    const b = candidate();
    vi.setSystemTime(new Date(Date.parse(b.startsAt) - 5 * MIN));
    const theirs = liveBookings().find((x) => x.customerId !== "cu-1")!;
    expect((await call("cu-1", theirs.bookingCode, EMMA)).status).toBe(404);
    expect((await call("cu-1", "NOPE-0000", EMMA)).status).toBe(404);
    expect((await call("cu-1", b.bookingCode, "someone@else.com")).status).toBe(404);
    expect((await call("cu-1", b.bookingCode)).status).toBe(404);
    expect(checkInByGuest("cu-1", "NOPE-0000")).toEqual({ ok: false, code: "NOT_FOUND" });
  });
  it("the list tells the page whether the guest can check in now", async () => {
    const b = candidate();
    vi.setSystemTime(new Date(Date.parse(b.startsAt) - 3 * 60 * MIN));
    expect((await mine("cu-1", EMMA)).bookings.find((x) => x.code === b.bookingCode)!.canCheckIn).toBe(false);
    vi.setSystemTime(new Date(Date.parse(b.startsAt) - 10 * MIN));
    expect((await mine("cu-1", EMMA)).bookings.find((x) => x.code === b.bookingCode)!.canCheckIn).toBe(true);
  });
});
