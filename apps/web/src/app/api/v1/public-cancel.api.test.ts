import { beforeEach, describe, expect, it } from "vitest";
import { canGuestCancel, liveBookings, liveCustomers, resetBookingStore, setBookingStatus } from "@/lib/mock/booking-store";
import { currentShop, customers, sessions } from "@/lib/mock/data";
import { outboxEmails, resetOutbox, type BookingCancelledEmail, type ShopBookingNoticeEmail } from "@/lib/mock/outbox-store";
import { POST as book } from "./public/sites/[slug]/bookings/route";
import { POST as cancel } from "./public/sites/[slug]/bookings/cancel/route";
import { PATCH as patchStatus } from "./bookings/[id]/status/route";

// A guest cancels their own booking (code + email of the booking) until the session starts; both sides get an email. The shop cancelling tells the guest too.

const ctx = { params: Promise.resolve({ slug: currentShop.slug }) } as never;
const post = (route: (request: Request, ctx: never) => Promise<Response>, body: unknown) =>
  route(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx);
const patch = (id: string, body: unknown) => patchStatus(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) } as never);
const FREE = sessions.find((s) => s.status === "RUNNING" && Date.parse(s.startsAt) > Date.now() + 86_400_000 && s.capacity - s.reservedCount >= 3)!;
const guest = { sessionId: FREE.id, quantity: 2, fullName: "Cancel Guest", email: "cancel.guest@example.com", phone: "+84 90 111 2222" };
const guestMails = () => outboxEmails().filter((e): e is BookingCancelledEmail => e.type === "BOOKING_CANCELLED");
const shopMails = () => outboxEmails().filter((e): e is ShopBookingNoticeEmail => e.type === "SHOP_BOOKING_NOTICE");
const reserved = () => liveBookings().filter((b) => b.sessionId === FREE.id && b.status !== "CANCELLED").reduce((n, b) => n + b.quantity, 0);

async function made(over: Partial<typeof guest> = {}) {
  const res = await post(book, { ...guest, ...over });
  return ((await res.json()) as { code: string }).code;
}

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("a new booking tells the shop", () => {
  it("the shop gets an email at its contact address with the guest and the booking", async () => {
    const code = await made();
    expect(shopMails()).toHaveLength(1);
    expect(shopMails()[0]).toMatchObject({ kind: "CREATED", to: currentShop.contactEmail, bookingCode: code, guestName: "Cancel Guest", guestEmail: "cancel.guest@example.com", quantity: 2 });
    expect(shopMails()[0]!.html).toContain(code);
    expect([...shopMails()[0]!.html.matchAll(/<section lang=/g)]).toHaveLength(6);
  });
});

describe("POST /public/sites/{slug}/bookings/cancel", () => {
  it("cancels the booking of a guest who gives the code and the email of the booking (whatever the case), frees the seats and keeps who and why", async () => {
    const code = await made();
    const seatsBefore = reserved();
    const res = await post(cancel, { code: code.toLowerCase(), email: "  Cancel.Guest@Example.com ", reason: "  Changed plans " });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code, status: "CANCELLED" });
    const b = liveBookings().find((x) => x.bookingCode === code)!;
    expect(b).toMatchObject({ status: "CANCELLED", cancelledBy: "GUEST", cancelReason: "Changed plans" });
    expect(reserved()).toBe(seatsBefore - 2);
  });
  it("the reason is optional", async () => {
    const code = await made();
    expect((await post(cancel, { code, email: guest.email })).status).toBe(200);
    expect(liveBookings().find((x) => x.bookingCode === code)).toMatchObject({ status: "CANCELLED", cancelledBy: "GUEST" });
    expect(liveBookings().find((x) => x.bookingCode === code)!.cancelReason).toBeUndefined();
  });
  it("emails the guest a confirmation and the shop a notice, with the reason", async () => {
    const code = await made();
    resetOutbox();
    await post(cancel, { code, email: guest.email, reason: "Changed plans" });
    expect(guestMails()).toHaveLength(1);
    expect(guestMails()[0]).toMatchObject({ to: guest.email, bookingCode: code, byGuest: true, reason: "Changed plans", guestName: "Cancel Guest" });
    expect(guestMails()[0]!.html).toContain("As you asked");
    expect(shopMails()).toHaveLength(1);
    expect(shopMails()[0]).toMatchObject({ kind: "CANCELLED_BY_GUEST", to: currentShop.contactEmail, reason: "Changed plans" });
  });
  it("is the same answer for a booking that does not exist and for an email that does not match", async () => {
    const code = await made();
    const wrongEmail = await post(cancel, { code, email: "someone.else@example.com" });
    const noBooking = await post(cancel, { code: "SES-9999-999", email: guest.email });
    expect(wrongEmail.status).toBe(404);
    expect(noBooking.status).toBe(404);
    expect(await wrongEmail.json()).toEqual(await noBooking.json());
    expect(liveBookings().find((x) => x.bookingCode === code)!.status).toBe("NOT_CONFIRMED");
    expect(guestMails()).toHaveLength(0);
  });
  it("cannot cancel a booking twice, one that is checked in, or one of a session that has started or is closed", async () => {
    const code = await made();
    expect((await post(cancel, { code, email: guest.email })).status).toBe(200);
    expect((await post(cancel, { code, email: guest.email })).status).toBe(409);
    const checkedIn = liveBookings().find((b) => b.status === "CHECKED_IN" && b.startsAt > new Date(0).toISOString())!;
    const mail = liveCustomers().find((c) => c.id === checkedIn.customerId)?.email;
    if (mail) expect((await post(cancel, { code: checkedIn.bookingCode, email: mail })).status).toBe(409);
    const past = liveBookings().find((b) => b.status === "CONFIRMED" && Date.parse(b.startsAt) < Date.now() && liveCustomers().find((c) => c.id === b.customerId)?.email)!;
    expect((await post(cancel, { code: past.bookingCode, email: liveCustomers().find((c) => c.id === past.customerId)!.email! })).status).toBe(409);
    const closed = liveBookings().find((b) => b.status === "CONFIRMED" && Date.parse(b.startsAt) > Date.now() && sessions.find((s) => s.id === b.sessionId)?.status === "CLOSED" && liveCustomers().find((c) => c.id === b.customerId)?.email);
    if (closed) expect((await post(cancel, { code: closed.bookingCode, email: liveCustomers().find((c) => c.id === closed.customerId)!.email! })).status).toBe(409);
  });
  it("works for a confirmed booking too, and for a customer of the demo data", async () => {
    const old = customers.find((c) => c.email === "minjun@example.com")!;
    const b = liveBookings().find((x) => x.customerId === old.id && x.status === "CONFIRMED" && canGuestCancel(x))!;
    expect(b).toBeDefined();
    expect((await post(cancel, { code: b.bookingCode, email: "MINJUN@example.com" })).status).toBe(200);
    expect(liveBookings().find((x) => x.id === b.id)).toMatchObject({ status: "CANCELLED", cancelledBy: "GUEST" });
  });
  it("checks what it is given, and the shop", async () => {
    expect((await post(cancel, { code: "", email: guest.email })).status).toBe(422);
    expect((await post(cancel, { code: "SES-0001-001", email: "nope" })).status).toBe(422);
    expect((await cancel(new Request("http://x", { method: "POST", body: JSON.stringify({ code: "A", email: "a@example.com" }) }), { params: Promise.resolve({ slug: "nope" }) } as never)).status).toBe(404);
  });
});

describe("canGuestCancel", () => {
  it("is for a booking that is not confirmed or confirmed, until its session starts", () => {
    const base = { sessionId: FREE.id, startsAt: new Date(Date.now() + 3_600_000).toISOString() };
    expect(canGuestCancel({ ...base, status: "NOT_CONFIRMED" })).toBe(true);
    expect(canGuestCancel({ ...base, status: "CONFIRMED" })).toBe(true);
    expect(canGuestCancel({ ...base, status: "CHECKED_IN" })).toBe(false);
    expect(canGuestCancel({ ...base, status: "CANCELLED" })).toBe(false);
    expect(canGuestCancel({ ...base, status: "CONFIRMED", startsAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);
  });
});

describe("the shop cancels a booking", () => {
  it("the guest is told, with the reason of the shop; a second cancel does not email again", async () => {
    const code = await made();
    const id = liveBookings().find((b) => b.bookingCode === code)!.id;
    resetOutbox();
    expect((await patch(id, { status: "CANCELLED", cancelReason: "The kiln broke" })).status).toBe(200);
    expect(guestMails()).toHaveLength(1);
    expect(guestMails()[0]).toMatchObject({ to: guest.email, byGuest: false, reason: "The kiln broke", bookingCode: code });
    expect(guestMails()[0]!.html).toContain("has cancelled your booking");
    expect(shopMails()).toHaveLength(0); // the shop did it: nothing to tell the shop
    expect(liveBookings().find((b) => b.id === id)).toMatchObject({ status: "CANCELLED", cancelledBy: "SHOP", cancelReason: "The kiln broke" });
    await patch(id, { status: "CANCELLED", cancelReason: "again" });
    expect(guestMails()).toHaveLength(1);
  });
  it("a guest without an email (walk-in) is not emailed", async () => {
    const walkIn = liveBookings().find((b) => b.status === "CONFIRMED" && !liveCustomers().find((c) => c.id === b.customerId)?.email)!;
    await patch(walkIn.id, { status: "CANCELLED", cancelReason: "x" });
    expect(guestMails()).toHaveLength(0);
  });
  it("another change of status does not email", async () => {
    const b = liveBookings().find((x) => x.status === "CONFIRMED" && liveCustomers().find((c) => c.id === x.customerId)?.email)!;
    await patch(b.id, { status: "CHECKED_IN" });
    expect(guestMails()).toHaveLength(0);
    setBookingStatus(b.id, "CONFIRMED");
  });
});
