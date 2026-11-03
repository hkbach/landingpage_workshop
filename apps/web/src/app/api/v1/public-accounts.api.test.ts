import { beforeEach, describe, expect, it } from "vitest";
import { liveBookings, liveCustomers, resetBookingStore } from "@/lib/mock/booking-store";
import { currentShop, customers, sessions } from "@/lib/mock/data";
import { resetOutbox } from "@/lib/mock/outbox-store";
import { POST as book } from "./public/sites/[slug]/bookings/route";
import { POST as register } from "./public/sites/[slug]/accounts/route";
import { POST as lookup } from "./public/sites/[slug]/accounts/lookup/route";

// A guest who is not logged in books: the system looks the email up. An email that booked before is the same customer, and an email that has an account counts
// the booking in the account. A guest who registers an account gets the earlier bookings made with the same email merged into it.

const slug = currentShop.slug;
const ctx = { params: Promise.resolve({ slug }) } as never;
const post = (route: (request: Request, ctx: never) => Promise<Response>, body: unknown) =>
  route(new Request("http://clayco.localtest.me:3000/x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx);
const FREE = sessions.find((s) => s.status === "OPEN" && Date.parse(s.startsAt) > Date.now())!;
const guest = (email: string, fullName = "Someone") => ({ sessionId: FREE.id, quantity: 1, fullName, email, phone: "+84 90 111 2222" });
const PROFILE = { fullName: "Tran Binh", country: "VN", birthDate: "1995-05-20" };

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("a guest who is not logged in books", () => {
  it("with an email that booked before: the booking is counted for that customer, whatever the case and the spaces", async () => {
    const before = liveCustomers().length;
    const old = customers.find((c) => c.email === "minjun@example.com")!;
    expect(old.account).toBeUndefined();
    const res = await post(book, guest("  MinJun@Example.COM ", "A different name"));
    expect(res.status).toBe(201);
    const made = liveBookings().find((b) => b.sessionId === FREE.id && b.status === "NOT_CONFIRMED" && b.customerId === old.id);
    expect(made).toBeDefined();
    expect(liveCustomers()).toHaveLength(before); // no new customer
    expect(liveCustomers().find((c) => c.id === old.id)!.fullName).toBe(old.fullName); // the customer keeps their name
  });
  it("with an email that has an account: the booking is counted in the account", async () => {
    const account = customers.find((c) => c.email === "emma@example.com")!;
    expect(account.account).toBeDefined();
    await post(book, guest("EMMA@example.com"));
    const mine = liveBookings().filter((b) => b.sessionId === FREE.id && b.customerId === account.id);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    expect(liveCustomers().filter((c) => c.email === "emma@example.com")).toHaveLength(1);
  });
  it("with an email that never booked: a new customer without an account", async () => {
    await post(book, guest("brand.new@example.com", "Brand New"));
    const c = liveCustomers().find((x) => x.email === "brand.new@example.com")!;
    expect(c).toMatchObject({ fullName: "Brand New" });
    expect(c.account).toBeUndefined();
  });
  it("a second booking with the same new email is the same customer", async () => {
    await post(book, guest("twice@example.com"));
    await post(book, guest("Twice@Example.com"));
    const c = liveCustomers().filter((x) => x.email === "twice@example.com");
    expect(c).toHaveLength(1);
    expect(liveBookings().filter((b) => b.customerId === c[0]!.id)).toHaveLength(2);
  });
});

describe("a guest registers an account", () => {
  it("merges the bookings made before with the same email into the account", async () => {
    await post(book, guest("binh.tran@example.com", "Tran B."));
    await post(book, guest("binh.tran@example.com", "Tran B."));
    const customer = liveCustomers().find((c) => c.email === "binh.tran@example.com")!;
    expect(customer.account).toBeUndefined();
    const res = await post(register, { email: "Binh.Tran@Example.com ", ...PROFILE });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ customerId: customer.id, created: false, merged: 2 });
    const now = liveCustomers().find((c) => c.id === customer.id)!;
    expect(now.account).toMatchObject({ country: "VN", birthDate: "1995-05-20" });
    expect(now.fullName).toBe("Tran Binh"); // the name of the account
    expect(liveBookings().filter((b) => b.customerId === customer.id)).toHaveLength(2); // the bookings are in the account
    expect(liveCustomers().filter((c) => c.email === "binh.tran@example.com")).toHaveLength(1);
  });
  it("merges the bookings of a customer who booked in the demo data too, and a later booking goes to the account", async () => {
    const old = customers.find((c) => c.email === "minjun@example.com")!;
    const count = liveBookings().filter((b) => b.customerId === old.id).length;
    const res = await post(register, { email: "minjun@example.com", fullName: "Kim Min-jun", country: "KR", birthDate: "1993-03-03" });
    expect(await res.json()).toMatchObject({ customerId: old.id, created: false, merged: count });
    expect(liveCustomers().find((c) => c.id === old.id)!.account).toMatchObject({ country: "KR" });
    await post(book, guest("MINJUN@example.com"));
    expect(liveBookings().filter((b) => b.customerId === old.id)).toHaveLength(count + 1);
  });
  it("an email that never booked gets a new customer with the account and nothing merged", async () => {
    const res = await post(register, { email: "fresh@example.com", ...PROFILE });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { customerId: string; created: boolean; merged: number };
    expect(body).toMatchObject({ created: true, merged: 0 });
    expect(liveCustomers().find((c) => c.id === body.customerId)).toMatchObject({ email: "fresh@example.com", account: { country: "VN" } });
  });
  it("an email that has an account is refused, and the guest logs in instead", async () => {
    const res = await post(register, { email: "emma@example.com", ...PROFILE });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("ALREADY_REGISTERED");
  });
  it("is registered once: the second try is refused", async () => {
    await post(register, { email: "once@example.com", ...PROFILE });
    expect((await post(register, { email: "ONCE@example.com", ...PROFILE })).status).toBe(409);
  });
  it("checks what it is given", async () => {
    expect((await post(register, { email: "bad", ...PROFILE })).status).toBe(422);
    expect((await post(register, { email: "a@example.com", ...PROFILE, fullName: "   " })).status).toBe(422);
    expect((await post(register, { email: "a@example.com", ...PROFILE, country: "ZZ" })).status).toBe(422);
    expect((await post(register, { email: "a@example.com", ...PROFILE, birthDate: "2999-01-01" })).status).toBe(422);
    expect((await post(register, { email: "a@example.com", ...PROFILE, birthDate: "not a date" })).status).toBe(422);
    expect(liveCustomers().some((c) => c.email === "a@example.com")).toBe(false);
  });
  it("404 for a shop that does not exist", async () => {
    const res = await register(new Request("http://x", { method: "POST", body: JSON.stringify({ email: "a@example.com", ...PROFILE }) }), { params: Promise.resolve({ slug: "nope" }) } as never);
    expect(res.status).toBe(404);
  });
});

describe("does an email have an account", () => {
  it("says whether it is registered and how many bookings it has", async () => {
    expect(await (await post(lookup, { email: "emma@example.com" })).json()).toMatchObject({ registered: true });
    const minjun = (await (await post(lookup, { email: "MinJun@example.com" })).json()) as { registered: boolean; bookings: number };
    expect(minjun.registered).toBe(false);
    expect(minjun.bookings).toBeGreaterThan(0);
    expect(await (await post(lookup, { email: "nobody@example.com" })).json()).toEqual({ registered: false, bookings: 0 });
  });
  it("is registered after the account was made", async () => {
    await post(register, { email: "minjun@example.com", fullName: "Kim", country: "KR", birthDate: "1993-03-03" });
    expect(await (await post(lookup, { email: "minjun@example.com" })).json()).toMatchObject({ registered: true });
  });
  it("422 for an email that is not one", async () => {
    expect((await post(lookup, { email: "x" })).status).toBe(422);
  });
});
