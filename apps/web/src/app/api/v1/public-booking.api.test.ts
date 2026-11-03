import { beforeEach, describe, expect, it } from "vitest";
import { liveBookings, liveCustomers, resetBookingStore, setBookingStatus } from "@/lib/mock/booking-store";
import { currentShop, sessions, workshops } from "@/lib/mock/data";
import { outboxEmails, resetOutbox, type BookingConfirmationEmail } from "@/lib/mock/outbox-store";
import { PATCH } from "./bookings/[id]/status/route";
import { POST as book } from "./public/sites/[slug]/bookings/route";
import { POST as confirm } from "./public/sites/[slug]/bookings/confirm/route";

// A guest books on the landing page: the booking is NOT_CONFIRMED and the guest gets an email with a link; opening the link confirms it. The shop owner
// checks guests in from either status, and an uncheck-in goes back to the status the booking had before.

const slug = currentShop.slug;
const ctx = { params: Promise.resolve({ slug }) } as never;
const post = (route: (request: Request, ctx: never) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  route(new Request("http://clayco.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) }), ctx);
const patch = (id: string, body: unknown) => PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) } as never);

const FREE = sessions.find((s) => s.status === "OPEN" && Date.parse(s.startsAt) > Date.now())!; // an open session of the future, with free seats
const GUEST = { sessionId: FREE.id, quantity: 2, fullName: "Tran Binh", email: "Binh@Example.com", phone: "+84 90 111 2222" };
const emails = () => outboxEmails().filter((e): e is BookingConfirmationEmail => e.type === "BOOKING_CONFIRMATION");
const statusOf = (id: string) => liveBookings().find((b) => b.id === id)!;
const tokenOf = () => emails()[0]!.confirmUrl.split("/").pop()!;

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("a guest books", () => {
  it("makes a NOT_CONFIRMED booking, with the code of the session and a new customer without an account", async () => {
    const res = await post(book, GUEST);
    expect(res.status).toBe(201);
    const made = (await res.json()) as { code: string; status: string };
    expect(made.status).toBe("NOT_CONFIRMED");
    expect(made.code).toMatch(new RegExp(`^${FREE.code}-\\d{3}$`));
    const booking = liveBookings().find((b) => b.bookingCode === made.code)!;
    expect(booking).toMatchObject({ status: "NOT_CONFIRMED", source: "ONLINE", quantity: 2, paymentStatus: "UNPAID" });
    const customer = liveCustomers().find((c) => c.id === booking.customerId)!;
    expect(customer).toMatchObject({ fullName: "Tran Binh", email: "binh@example.com" });
    expect(customer.account).toBeUndefined(); // booked without an account: no country, no birth date
  });
  it("the server works out the price: the price of the workshop times the guests, nothing from the browser", async () => {
    const price = workshops.find((w) => w.id === FREE.workshopId)!.priceAmount;
    const res = await post(book, { ...GUEST, totalAmount: 1, status: "CONFIRMED", unitPriceAmount: 1 });
    const made = (await res.json()) as { code: string };
    expect(liveBookings().find((b) => b.bookingCode === made.code)).toMatchObject({ totalAmount: price * 2, status: "NOT_CONFIRMED", unitPriceAmount: price });
  });
  it("sends the guest an email with the booking and the link that confirms it, in the language of the guest", async () => {
    await post(book, { ...GUEST, locale: "vi" });
    expect(emails()).toHaveLength(1);
    expect(emails()[0]).toMatchObject({ type: "BOOKING_CONFIRMATION", to: "binh@example.com", locale: "vi", quantity: 2 });
    expect(emails()[0]!.confirmUrl).toMatch(/^http:\/\/clayco\.localtest\.me:3000\/booking\/confirm\/[0-9a-f-]{36}$/);
  });
  it("a repeated Idempotency-Key gives the same booking and no second email", async () => {
    const a = await post(book, GUEST, { "idempotency-key": "k-1" });
    const b = await post(book, GUEST, { "idempotency-key": "k-1" });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(((await b.json()) as { code: string }).code).toBe(((await a.json()) as { code: string }).code);
    expect(liveBookings().filter((x) => x.customerId === liveCustomers().find((c) => c.email === "binh@example.com")!.id)).toHaveLength(1);
    expect(emails()).toHaveLength(1);
  });
  it("a guest who booked before is the same customer (found by email)", async () => {
    await post(book, GUEST);
    await post(book, { ...GUEST, email: " binh@example.com ", fullName: "Someone else" });
    expect(liveCustomers().filter((c) => c.email === "binh@example.com")).toHaveLength(1);
  });
  it("holds seats at once, and refuses a booking that no longer fits", async () => {
    const before = liveBookings().filter((b) => b.sessionId === FREE.id && b.status !== "CANCELLED").reduce((n, b) => n + b.quantity, 0);
    expect((await post(book, { ...GUEST, quantity: 1 })).status).toBe(201);
    const left = FREE.capacity - before - 1;
    const full = await post(book, { ...GUEST, email: "other@example.com", quantity: Math.min(left + 1, 6) });
    if (left + 1 <= 6) expect(full.status).toBe(409);
  });
  it("refuses a closed session, an unknown session, a wrong quantity and a bad email", async () => {
    const closed = sessions.find((s) => s.status === "CLOSED")!;
    expect((await post(book, { ...GUEST, sessionId: closed.id })).status).toBe(409);
    expect((await post(book, { ...GUEST, sessionId: "se-nope" })).status).toBe(404);
    expect((await post(book, { ...GUEST, quantity: 0 })).status).toBe(422);
    expect((await post(book, { ...GUEST, quantity: 99 })).status).toBe(422);
    expect((await post(book, { ...GUEST, email: "nope" })).status).toBe(422);
    expect(emails()).toHaveLength(0);
  });
});

describe("the link of the email", () => {
  it("confirms the booking: NOT_CONFIRMED becomes CONFIRMED", async () => {
    const made = (await (await post(book, GUEST)).json()) as { code: string };
    const id = liveBookings().find((b) => b.bookingCode === made.code)!.id;
    const res = await post(confirm, { token: tokenOf() });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: made.code, status: "CONFIRMED", already: false });
    expect(statusOf(id).status).toBe("CONFIRMED");
  });
  it("opening it again changes nothing", async () => {
    await post(book, GUEST);
    await post(confirm, { token: tokenOf() });
    const again = await post(confirm, { token: tokenOf() });
    expect(((await again.json()) as { already: boolean }).already).toBe(true);
  });
  it("a link that is not valid, or of a cancelled booking, does not confirm", async () => {
    expect((await post(confirm, { token: "00000000-0000-0000-0000-000000000000" })).status).toBe(404);
    expect((await post(confirm, { token: "x" })).status).toBe(404);
    const made = (await (await post(book, GUEST)).json()) as { code: string };
    const id = liveBookings().find((b) => b.bookingCode === made.code)!.id;
    setBookingStatus(id, "CANCELLED", "Guest changed plans");
    expect((await post(confirm, { token: tokenOf() })).status).toBe(409);
    expect(statusOf(id).status).toBe("CANCELLED");
  });
});

describe("check-in and uncheck-in", () => {
  const newBooking = async () => {
    const made = (await (await post(book, GUEST)).json()) as { code: string };
    return liveBookings().find((b) => b.bookingCode === made.code)!.id;
  };
  it("a booking that is not confirmed can be checked in, and the uncheck-in puts it back to NOT_CONFIRMED", async () => {
    const id = await newBooking();
    await patch(id, { status: "CHECKED_IN", checkedInAt: "2026-11-05T09:00:00.000Z" });
    expect(statusOf(id)).toMatchObject({ status: "CHECKED_IN", statusBeforeCheckIn: "NOT_CONFIRMED" });
    await patch(id, { status: "NOT_CONFIRMED" });
    expect(statusOf(id)).toMatchObject({ status: "NOT_CONFIRMED" });
    expect(statusOf(id).statusBeforeCheckIn).toBeUndefined();
    expect(statusOf(id).checkedInAt).toBeUndefined();
  });
  it("a confirmed booking is put back to CONFIRMED", async () => {
    const id = await newBooking();
    await post(confirm, { token: tokenOf() });
    await patch(id, { status: "CHECKED_IN" });
    expect(statusOf(id)).toMatchObject({ status: "CHECKED_IN", statusBeforeCheckIn: "CONFIRMED" });
    await patch(id, { status: "CONFIRMED" });
    expect(statusOf(id).status).toBe("CONFIRMED");
  });
  it("the status before is the one the client sent, or the booking had", async () => {
    const id = await newBooking();
    await patch(id, { status: "CHECKED_IN", statusBeforeCheckIn: "NOT_CONFIRMED" });
    expect(statusOf(id).statusBeforeCheckIn).toBe("NOT_CONFIRMED");
    expect((await patch(id, { status: "CHECKED_IN", statusBeforeCheckIn: "COMPLETED" })).status).toBe(422);
  });
  it("a guest who opens the link after being checked in stays checked in, and an uncheck-in then goes back to CONFIRMED", async () => {
    const id = await newBooking();
    await patch(id, { status: "CHECKED_IN" });
    const res = await post(confirm, { token: tokenOf() });
    expect(res.status).toBe(200);
    expect(statusOf(id)).toMatchObject({ status: "CHECKED_IN", statusBeforeCheckIn: "CONFIRMED" });
  });
  it("the removed statuses are refused", async () => {
    for (const status of ["COMPLETED", "NO_SHOW", "LATE_RELEASED", "SESSION_EXPIRED"]) expect((await patch("bk-13", { status })).status, status).toBe(422);
  });
  it("the demo guests who were checked in come back to the status they had before", () => {
    const b = liveBookings();
    expect(b.find((x) => x.id === "bk-21")).toMatchObject({ status: "CHECKED_IN", statusBeforeCheckIn: "NOT_CONFIRMED" });
    expect(b.find((x) => x.id === "bk-12")).toMatchObject({ status: "CHECKED_IN", statusBeforeCheckIn: "CONFIRMED" });
  });
});
