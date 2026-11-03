import { beforeEach, describe, expect, it } from "vitest";
import { liveBookings, liveCustomers, resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop, customers, sessions } from "@/lib/mock/data";
import { outboxEmails, resetOutbox, type BookingConfirmationEmail, type BookingInfoEmail } from "@/lib/mock/outbox-store";
import { guestNameOf } from "@/lib/guest-name";
import { POST as make } from "./bookings/route";
import { POST as book } from "./public/sites/[slug]/bookings/route";

// The shop makes a booking for a guest who is at the studio or calls: it is CONFIRMED at once and a guest with an email gets an email with the details (no link
// to confirm). Every booking keeps the name that was typed, whatever the customer (found by email) is called.

const post = (route: (request: Request, ctx: never) => Promise<Response>, body: unknown, ctx?: unknown) =>
  route(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx as never);
const guestCtx = { params: Promise.resolve({ slug: currentShop.slug }) };
const FREE = sessions.find((s) => s.status === "RUNNING" && Date.parse(s.startsAt) > Date.now() + 86_400_000 && s.capacity - s.reservedCount >= 3)!;
const base = { sessionId: FREE.id, quantity: 2, source: "WALK_IN", fullName: "  Linh Tran  " };
const infoMails = () => outboxEmails().filter((e): e is BookingInfoEmail => e.type === "BOOKING_INFO");

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("POST /bookings (the shop makes a booking)", () => {
  it("makes a CONFIRMED booking with the code of the session, the price of the server and the trimmed name", async () => {
    const res = await post(make, base);
    expect(res.status).toBe(201);
    const made = (await res.json()) as { id: string; code: string; emailed: boolean };
    expect(made.code).toMatch(new RegExp(`^${FREE.code}-\\d{3}$`));
    const b = liveBookings().find((x) => x.id === made.id)!;
    expect(b).toMatchObject({ status: "CONFIRMED", paymentStatus: "UNPAID", source: "WALK_IN", quantity: 2, guestName: "Linh Tran" });
    expect(b.totalAmount).toBe(b.unitPriceAmount * 2);
  });
  it("a guest without an email: no email is sent", async () => {
    const made = (await (await post(make, base)).json()) as { emailed: boolean };
    expect(made.emailed).toBe(false);
    expect(outboxEmails()).toHaveLength(0);
  });
  it("a guest with an email gets an information email with the details and no link to confirm", async () => {
    const made = (await (await post(make, { ...base, source: "PHONE", email: "  Caller@Example.com " })).json()) as { code: string; emailed: boolean };
    expect(made.emailed).toBe(true);
    expect(infoMails()).toHaveLength(1);
    const mail = infoMails()[0]!;
    expect(mail).toMatchObject({ to: "caller@example.com", bookingCode: made.code, guestName: "Linh Tran", quantity: 2 });
    expect(mail.html).toContain(made.code);
    expect(mail.html).not.toContain("confirm/"); // no link
    expect([...mail.html.matchAll(/<section lang=/g)]).toHaveLength(6);
    expect(outboxEmails().some((e) => e.type === "BOOKING_CONFIRMATION")).toBe(false);
  });
  it("the same email is the same customer (a customer who booked before), and the booking keeps the name that was typed", async () => {
    const old = customers.find((c) => c.email === "minjun@example.com")!;
    const made = (await (await post(make, { ...base, email: "minjun@example.com", fullName: "A Friend" })).json()) as { id: string };
    const b = liveBookings().find((x) => x.id === made.id)!;
    expect(b.customerId).toBe(old.id);
    expect(guestNameOf(b, liveCustomers())).toBe("A Friend");
    expect(liveCustomers().find((c) => c.id === old.id)!.fullName).toBe(old.fullName); // the customer is not renamed
    expect(infoMails()[0]!.guestName).toBe("A Friend");
  });
  it("a phone or other booking needs an email", async () => {
    expect((await post(make, { ...base, source: "PHONE" })).status).toBe(422);
    expect((await post(make, { ...base, source: "OTHER", email: "" })).status).toBe(422);
    expect(liveBookings().some((b) => b.guestName === "Linh Tran")).toBe(false);
  });
  it("checks what it is given", async () => {
    expect((await post(make, { ...base, fullName: "   " })).status).toBe(422);
    expect((await post(make, { ...base, email: "not an email" })).status).toBe(422);
    expect((await post(make, { ...base, source: "ONLINE" })).status).toBe(422);
    expect((await post(make, { ...base, quantity: 0 })).status).toBe(422);
    expect((await post(make, { ...base, quantity: 99 })).status).toBe(422);
    expect((await post(make, { ...base, sessionId: "se-nope" })).status).toBe(404);
  });
  it("refuses a session that is full, and one that cannot take bookings", async () => {
    const full = sessions.find((s) => s.status === "RUNNING" && s.capacity - s.reservedCount === 0 && Date.parse(s.endsAt) > Date.now());
    if (full) expect((await post(make, { ...base, sessionId: full.id, quantity: 1 })).status).toBe(409);
    const open = sessions.find((s) => s.status === "OPEN")!;
    expect((await post(make, { ...base, sessionId: open.id })).status).toBe(409);
  });
});

describe("every booking keeps the name that was typed", () => {
  it("a guest who books online with the email of a customer: the booking has the name typed, the email greets that name and the customer keeps their name", async () => {
    const old = customers.find((c) => c.email === "minjun@example.com")!;
    await post(book, { sessionId: FREE.id, quantity: 1, fullName: "Min", email: "minjun@example.com", phone: "+82 10 0000 0000" }, guestCtx);
    const b = liveBookings().find((x) => x.sessionId === FREE.id && x.guestName === "Min")!;
    expect(b.customerId).toBe(old.id);
    const mail = outboxEmails().find((e): e is BookingConfirmationEmail => e.type === "BOOKING_CONFIRMATION")!;
    expect(mail.guestName).toBe("Min");
    expect(liveCustomers().find((c) => c.id === old.id)!.fullName).toBe(old.fullName);
  });
  it("a booking of the demo data without a typed name shows the name of the customer", () => {
    const b = liveBookings().find((x) => !x.guestName)!;
    expect(guestNameOf(b, liveCustomers())).toBe(liveCustomers().find((c) => c.id === b.customerId)!.fullName);
  });
});
