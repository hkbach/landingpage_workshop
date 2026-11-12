import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "../auth/crypto";
import { TEST_DATABASE_URL, cookieOf, drain, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The public side of booking on a real PostgreSQL: the capacity race, the code by email, idempotency, confirm, look up, cancel and the isolation of the shops.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string; workshopId: string }
const OTP = "123456";
const guest = (email: string, over: Record<string, unknown> = {}) => ({ fullName: ` Guest ${unique("g")} `, email, country: "VN", phone: "+84 90 000 0000", ...over });
let ip = 0;
const nextIp = (): string => `10.${Math.floor(ip / 250) % 250}.${Math.floor(ip++ % 250)}.9`;

d("public booking", () => {
  let t: TestApp;
  let a: Shop;
  let b: Shop;

  /** A shop that is ACTIVE with an ACTIVE workshop. */
  async function makeShop(label: string): Promise<Shop> {
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const w = await t.post("/workshops", { title: { en: `Booking test ${unique("w")}` }, durationMinutes: 90, priceAmount: 250_000, defaultCapacity: 10, maxPerBooking: 4, categories: ["COOKING"], address: "1 Test Street" }, { cookie });
    const workshopId = w.json().id as string;
    await t.post(`/workshops/${workshopId}/status`, { status: "ACTIVE" }, { cookie });
    return { cookie, orgId, slug, workshopId };
  }

  /** A RUNNING session of the shop, `days` from now (the SQL keeps the test fast and lets it set capacity and cut-off). */
  async function session(shop: Shop, opts: { capacity?: number; days?: number; status?: string; cutoff?: number; workshopId?: string } = {}): Promise<string> {
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [shop.orgId])).rows[0]!.n;
    const days = opts.days ?? 5;
    const r = await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code, booking_cutoff_minutes)
       select $1, $2, s, s, s + interval '90 minutes', $3, $4, $5, $6 from (select now() + $7::numeric * interval '1 day' as s) x returning id`,
      [shop.orgId, opts.workshopId ?? shop.workshopId, opts.capacity ?? 10, opts.status ?? "RUNNING", `SES-${String(seq).padStart(4, "0")}`, opts.cutoff ?? 120, days],
    );
    return r.rows[0]!.id;
  }

  /** The code the guest would get by email, planted in the table with a known value (the real email flow has its own test). */
  async function plantOtp(shop: Shop, rawEmail: string, code = OTP): Promise<void> {
    const email = rawEmail.trim().toLowerCase(); // the server looks the code up by the normalised email
    const id = (await t.pool.query<{ id: string }>("insert into booking_otps (organization_id, email, code_hash, expires_at) values ($1, $2, 'x', now() + interval '10 minutes') returning id", [shop.orgId, email])).rows[0]!.id;
    await t.pool.query("update booking_otps set code_hash = $2 where id = $1", [id, hashToken(`${id}:${code}`)]);
  }

  const book = (shop: Shop, body: Record<string, unknown>, key = unique("k") + "-key-1", from = nextIp()) =>
    t.app.inject({ method: "POST", url: `/api/v1/public/sites/${shop.slug}/bookings`, remoteAddress: from, headers: { "idempotency-key": key, origin: "https://some-shop.example" }, payload: body as object });

  /** Plants a code and books: the whole request of the form. */
  async function bookOnce(shop: Shop, sessionId: string, over: { quantity?: number; email?: string; key?: string; guest?: Record<string, unknown>; extra?: Record<string, unknown> } = {}) {
    const email = over.email ?? emailFor("guest");
    await plantOtp(shop, email);
    return book(shop, { sessionId, quantity: over.quantity ?? 1, guest: guest(email, over.guest), consent: true, otp: OTP, ...over.extra }, over.key);
  }

  beforeAll(async () => {
    t = await startApp();
    a = await makeShop("bka");
    b = await makeShop("bkb");
  });
  afterAll(async () => { await t.close(); });

  const seats = async (sessionId: string) => (await t.pool.query<{ reserved_count: number; capacity: number }>("select reserved_count, capacity from workshop_sessions where id = $1", [sessionId])).rows[0]!;

  it("shows a shop only while it is ACTIVE, and only what a guest may see: RUNNING and CLOSED sessions, with the reason a session cannot be booked", async () => {
    const running = await session(a, { days: 20 });
    const soon = await session(a, { days: 20.01, cutoff: 10_080 }); // starts in 20 days with the longest cut-off (7 days): still bookable
    const tooSoon = await session(a, { days: 0.05, cutoff: 600 }); // inside its cut-off
    await session(a, { days: 21, status: "OPEN" });
    await session(a, { days: 22, status: "PAUSED" });
    const closed = await session(a, { days: 23, status: "CLOSED" });
    const full = await session(a, { days: 24, capacity: 1 });
    await t.pool.query("update workshop_sessions set reserved_count = 1 where id = $1", [full]);

    const site = await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${a.slug}` });
    expect(site.statusCode).toBe(200);
    expect(site.json().shop).toMatchObject({ slug: a.slug, currency: "VND" });
    expect(site.json().workshops.map((w: { id: string }) => w.id)).toContain(a.workshopId);
    expect(JSON.stringify(site.json())).not.toContain(a.orgId); // no internal id of the shop

    const res = await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${a.slug}/workshops/${a.workshopId}/availability` });
    expect(res.statusCode).toBe(200);
    const items = res.json().items as { id: string; bookable: boolean; reason: string | null; remaining: number }[];
    const by = Object.fromEntries(items.map((i) => [i.id, i]));
    expect(by[running]).toMatchObject({ bookable: true, reason: null, remaining: 10 });
    expect(by[soon]).toBeDefined();
    expect(by[tooSoon]).toMatchObject({ bookable: false, reason: "BOOKING_CLOSED" });
    expect(by[closed]).toMatchObject({ bookable: false, reason: "CLOSED" });
    expect(by[full]).toMatchObject({ bookable: false, reason: "SOLD_OUT", remaining: 0 });
    expect(items).toHaveLength(Object.keys(by).length);
    expect(items).toHaveLength(5); // the two OPEN / PAUSED sessions are not listed: bookable, soon, too soon, closed, sold out
    expect(res.json().timezone).toBe("Asia/Ho_Chi_Minh");

    // a shop that is not ACTIVE, an unknown one and a draft workshop are the same 404
    expect((await t.app.inject({ method: "GET", url: "/api/v1/public/sites/no-such-shop-here" })).statusCode).toBe(404);
    await t.pool.query("update organizations set status = 'DRAFT' where id = $1", [b.orgId]);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${b.slug}` })).statusCode).toBe(404);
    await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [b.orgId]);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${b.slug}/workshops/${b.workshopId}/availability` })).statusCode).toBe(404);
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [b.orgId]);
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${a.slug}/workshops/${b.workshopId}/availability` })).statusCode).toBe(404); // a workshop of another shop
  });

  it("sends the code by email (only its hash is kept), with a cool-down, 5 tries and a single use", async () => {
    const email = emailFor("otp");
    const ask = (from = nextIp()) => t.app.inject({ method: "POST", url: `/api/v1/public/sites/${a.slug}/booking-otp`, remoteAddress: from, payload: { email } });
    expect((await ask()).statusCode).toBe(202);
    await drain(t);
    const mail = t.emails.sent.filter((m) => m.to === email).at(-1)!;
    const code = /\b(\d{6})\b/.exec(mail.text)![1]!;
    expect(mail.subject).toContain(code);
    const row = (await t.pool.query<{ code_hash: string }>("select code_hash from booking_otps where organization_id = $1 and email = $2", [a.orgId, email])).rows[0]!;
    expect(row.code_hash).not.toContain(code);
    expect(row.code_hash).toMatch(/^[0-9a-f]{64}$/);
    const again = await ask();
    expect(again.statusCode).toBe(429); // 30 seconds between two codes
    expect(again.json().error.details.retryAfterSeconds).toBeGreaterThan(0);

    const sid = await session(a, { days: 30 });
    const tryWith = (otp: string) => book(a, { sessionId: sid, quantity: 1, guest: guest(email), consent: true, otp }, unique("k") + "-key-1");
    for (let i = 1; i <= 4; i++) {
      const wrong = await tryWith("000000");
      expect(wrong.statusCode).toBe(422);
      expect(wrong.json().error).toMatchObject({ code: "OTP_INVALID", details: { attemptsLeft: 5 - i } });
    }
    expect((await tryWith("000000")).statusCode).toBe(422); // the 5th wrong try
    const locked = await tryWith(code); // even the right code: it is dead after 5 wrong tries
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error.code).toBe("OTP_LOCKED");
    expect((await seats(sid)).reserved_count).toBe(0);
  });

  it("makes a booking: NOT_CONFIRMED, the price of the server, a code of the session, seats taken, a customer, a link by email, the shop told, audited", async () => {
    const sid = await session(a, { days: 31 });
    const email = emailFor("happy");
    const res = await bookOnce(a, sid, { quantity: 3, email, extra: { totalAmount: 1, unitPriceAmount: 1, price: 1, status: "CONFIRMED" } }); // none of these is read
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ status: "NOT_CONFIRMED", quantity: 3, totalAmount: 750_000, currency: "VND", canCancel: true });
    expect(body.code).toMatch(/^SES-\d{4}-001$/);
    expect(body.guestName).toMatch(/^Guest /); // trimmed
    expect(JSON.stringify(body)).not.toMatch(/"id"|organizationId|idempotency/);
    expect(await seats(sid)).toMatchObject({ reserved_count: 3 });

    const row = (await t.pool.query("select * from bookings where booking_code = $1 and organization_id = $2", [body.code, a.orgId])).rows[0]!;
    expect(row).toMatchObject({ unit_price_amount: "250000", total_amount: "750000", payment_status: "UNPAID", source: "ONLINE", guest_email: email, created_by: null });
    expect(row.snapshot).toMatchObject({ timezone: "Asia/Ho_Chi_Minh", address: "1 Test Street", subtotalAmount: 750_000 });
    expect(row.snapshot.workshopTitle.en).toMatch(/^Booking test/);
    expect((await t.pool.query("select 1 from customers where organization_id = $1 and email_normalized = $2", [a.orgId, email])).rowCount).toBe(1);

    await drain(t);
    const guestMail = t.emails.sent.find((m) => m.to === email && m.subject.startsWith("Your booking"))!;
    expect(guestMail.text).toContain(body.code);
    expect(guestMail.text).toContain("pay at the studio");
    expect(guestMail.text).toContain("arrive on time");
    const link = /(https?:\/\/\S+\/booking\/confirm\/[A-Za-z0-9_-]+)/.exec(guestMail.text)![1]!;
    expect(link).toContain(`://${a.slug}.localtest.me:3000/booking/confirm/`);
    const token = link.split("/").at(-1)!;
    const stored = await t.pool.query("select token_hash from booking_confirmations where organization_id = $1", [a.orgId]);
    expect(JSON.stringify(stored.rows)).not.toContain(token); // only the hash
    const owner = (await t.pool.query<{ contact_email: string }>("select contact_email from organizations where id = $1", [a.orgId])).rows[0]!.contact_email;
    expect(t.emails.sent.some((m) => m.to === owner && m.subject === `New booking ${body.code}`)).toBe(true);
    const audit = await t.pool.query("select actor_user_id, ip from audit_logs where entity_id = $1 and action = 'booking.create'", [row.id]);
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].actor_user_id).toBeNull(); // a guest

    const second = await bookOnce(a, sid, { quantity: 1 });
    expect(second.json().code).toMatch(/^SES-\d{4}-002$/); // the next number of the same session
    expect((await seats(sid)).reserved_count).toBe(4);
  });

  it("answers a repeated Idempotency-Key with 200 and the same booking, and takes the seats once, even when the two requests arrive together", async () => {
    const sid = await session(a, { days: 32 });
    const email = emailFor("idem");
    await plantOtp(a, email);
    const key = `idem-${unique("i")}`;
    const body = { sessionId: sid, quantity: 2, guest: guest(email), consent: true, otp: OTP };
    const first = await book(a, body, key);
    expect(first.statusCode).toBe(201);
    const replay = await book(a, body, key);
    expect(replay.statusCode).toBe(200);
    expect(replay.json().code).toBe(first.json().code);
    expect((await seats(sid)).reserved_count).toBe(2);

    const sid2 = await session(a, { days: 33 });
    const email2 = emailFor("idem2");
    await plantOtp(a, email2);
    const key2 = `idem-${unique("j")}`;
    const both = await Promise.all([book(a, { sessionId: sid2, quantity: 2, guest: guest(email2), consent: true, otp: OTP }, key2), book(a, { sessionId: sid2, quantity: 2, guest: guest(email2), consent: true, otp: OTP }, key2)]);
    expect(both.every((r) => r.statusCode === 201 || r.statusCode === 200)).toBe(true);
    expect(new Set(both.map((r) => r.json().code)).size).toBe(1);
    expect((await seats(sid2)).reserved_count).toBe(2);
    expect((await t.app.inject({ method: "POST", url: `/api/v1/public/sites/${a.slug}/bookings`, remoteAddress: nextIp(), payload: body })).statusCode).toBe(422); // the header is required
  });

  it("never overbooks: 25 guests race for 10 seats and exactly 10 get one", async () => {
    const sid = await session(a, { days: 34, capacity: 10 });
    const emails = Array.from({ length: 25 }, () => emailFor("race"));
    for (const e of emails) await plantOtp(a, e);
    const results = await Promise.all(emails.map((email) => book(a, { sessionId: sid, quantity: 1, guest: guest(email), consent: true, otp: OTP })));
    const ok = results.filter((r) => r.statusCode === 201);
    const full = results.filter((r) => r.statusCode === 409);
    expect(ok).toHaveLength(10);
    expect(full).toHaveLength(15);
    expect(full.every((r) => r.json().error.code === "SESSION_FULL")).toBe(true);
    expect(await seats(sid)).toEqual({ reserved_count: 10, capacity: 10 });
    const codes = ok.map((r) => r.json().code as string).sort();
    expect(new Set(codes).size).toBe(10); // no code twice
    expect(codes.map((c) => Number(c.slice(-3)))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]); // and no gap: the numbers are given under the lock
    const rows = await t.pool.query("select count(*)::int as n, coalesce(sum(quantity), 0)::int as q from bookings where session_id = $1", [sid]);
    expect(rows.rows[0]).toEqual({ n: 10, q: 10 });
  });

  it("the last seat goes to one of two guests; groups of different sizes never add up to more than the capacity", async () => {
    const last = await session(a, { days: 35, capacity: 5 });
    await t.pool.query("update workshop_sessions set reserved_count = 4 where id = $1", [last]);
    const [x, y] = await Promise.all([bookOnce(a, last), bookOnce(a, last)]);
    expect([x.statusCode, y.statusCode].sort()).toEqual([201, 409]);
    expect((await seats(last)).reserved_count).toBe(5);

    const groups = await session(a, { days: 36, capacity: 10 });
    const sizes = [4, 4, 4, 3, 3, 2, 2, 1, 1, 1];
    const out = await Promise.all(sizes.map((q) => bookOnce(a, groups, { quantity: q })));
    const taken = out.filter((r) => r.statusCode === 201).reduce((n, r) => n + r.json().quantity, 0);
    const final = (await seats(groups)).reserved_count;
    expect(final).toBe(taken);
    expect(final).toBeLessThanOrEqual(10);
    expect(out.filter((r) => r.statusCode !== 201).every((r) => r.statusCode === 409 && r.json().error.code === "SESSION_FULL")).toBe(true);
    const refused = out.find((r) => r.statusCode === 409);
    if (refused) expect(refused.json().error.details.remaining).toBeLessThan(10);
  });

  it("refuses what cannot be booked: a session that is not RUNNING, inside its cut-off, of another shop, too many guests, no consent, a bad email, a draft workshop", async () => {
    const check = async (over: Parameters<typeof bookOnce>[2], sid: string) => bookOnce(a, sid, over);
    const open = await session(a, { days: 37, status: "OPEN" });
    expect((await check({}, open)).json().error).toMatchObject({ code: "NOT_BOOKABLE" });
    const closing = await session(a, { days: 0.02, cutoff: 120 });
    const late = await check({}, closing);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe("BOOKING_CLOSED");
    const ok = await session(a, { days: 38 });
    expect((await check({ quantity: 5 }, ok)).json().error.details.fields).toEqual({ quantity: "quantityRange" }); // the workshop allows 4 a booking
    expect((await check({ quantity: 0 }, ok)).statusCode).toBe(422);
    expect((await check({ extra: { consent: false } }, ok)).json().error.details.fields).toHaveProperty("consent", "consentRequired");
    expect((await check({ guest: { email: "nope" } }, ok)).statusCode).toBe(422);
    expect((await check({ guest: { phone: "1" } }, ok)).json().error.details.fields).toHaveProperty("guest.phone", "required");
    const foreign = await session(b, { days: 39 });
    expect((await check({}, foreign)).json().error.details.fields).toEqual({ sessionId: "unknown" }); // another shop's session looks like none
    const w2 = (await t.post("/workshops", { title: { en: `Draft ${unique("d")}` }, durationMinutes: 60, priceAmount: 1, defaultCapacity: 5, maxPerBooking: 2, categories: ["COOKING"] }, { cookie: a.cookie })).json().id as string;
    const draft = await session(a, { days: 40, workshopId: w2 });
    expect((await check({}, draft)).json().error.details.fields).toEqual({ sessionId: "unknown" });
    expect((await seats(ok)).reserved_count).toBe(0); // nothing was taken by any of these
  });

  it("puts the bookings of one email in one customer, keeps the name each booking was made with, and does not overwrite the customer", async () => {
    const sid = await session(a, { days: 41 });
    const email = emailFor("same");
    const first = await bookOnce(a, sid, { email, guest: { fullName: "Anna Lee", country: "VN" } });
    const second = await bookOnce(a, sid, { email: ` ${email.toUpperCase()} `, guest: { fullName: "A. Lee-Smith", country: "KR" } }); // trimmed and lowercased
    expect([first.statusCode, second.statusCode]).toEqual([201, 201]);
    const customersOf = await t.pool.query<{ full_name: string; country: string }>("select full_name, country from customers where organization_id = $1 and email_normalized = $2", [a.orgId, email]);
    expect(customersOf.rows).toEqual([{ full_name: "Anna Lee", country: "VN" }]); // one customer, the first data kept
    const names = await t.pool.query<{ guest_name: string }>("select guest_name from bookings where organization_id = $1 and guest_email = $2 order by created_at", [a.orgId, email]);
    expect(names.rows.map((r) => r.guest_name)).toEqual(["Anna Lee", "A. Lee-Smith"]); // each booking has its own name
    const other = await bookOnce(b, await session(b, { days: 41 }), { email }); // the same email in another shop is another customer
    expect(other.statusCode).toBe(201);
    expect((await t.pool.query("select count(distinct organization_id)::int as n from customers where email_normalized = $1", [email])).rows[0]).toEqual({ n: 2 });
  });

  it("confirms with the link: NOT_CONFIRMED becomes CONFIRMED once, opening it again changes nothing, a cancelled booking cannot be confirmed, an old link is refused", async () => {
    const sid = await session(a, { days: 42 });
    const email = emailFor("confirm");
    const made = (await bookOnce(a, sid, { email })).json();
    await drain(t);
    const token = /\/booking\/confirm\/([A-Za-z0-9_-]+)/.exec(t.emails.sent.filter((m) => m.to === email).at(-1)!.text)![1]!;
    const confirm = (tk: string) => t.app.inject({ method: "POST", url: "/api/v1/public/bookings/confirm", remoteAddress: nextIp(), headers: { origin: "https://some-shop.example" }, payload: { token: tk } });
    expect((await confirm(token)).json()).toEqual({ code: made.code, status: "CONFIRMED", changed: true });
    expect((await confirm(token)).json()).toEqual({ code: made.code, status: "CONFIRMED", changed: false });
    expect((await confirm("x".repeat(43))).json().error.code).toBe("TOKEN_INVALID");

    const email2 = emailFor("confirm2");
    await bookOnce(a, sid, { email: email2 });
    await drain(t);
    const t2 = /\/booking\/confirm\/([A-Za-z0-9_-]+)/.exec(t.emails.sent.filter((m) => m.to === email2).at(-1)!.text)![1]!;
    await t.pool.query("update booking_confirmations set expires_at = now() - interval '1 minute' where token_hash = $1", [hashToken(t2)]);
    expect((await confirm(t2)).statusCode).toBe(400);

    const email3 = emailFor("confirm3");
    const third = (await bookOnce(a, sid, { email: email3 })).json();
    await drain(t);
    const t3 = /\/booking\/confirm\/([A-Za-z0-9_-]+)/.exec(t.emails.sent.filter((m) => m.to === email3).at(-1)!.text)![1]!;
    await t.pool.query("update bookings set status = 'CANCELLED', cancelled_by = 'SHOP' where organization_id = $1 and booking_code = $2", [a.orgId, third.code]);
    const refused = await confirm(t3);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe("BOOKING_CANCELLED");
  });

  it("looks a booking up by code AND email (a wrong one is the same 404), and the guest cancels: the seats come back, both sides are told", async () => {
    const sid = await session(a, { days: 43, capacity: 3 });
    const email = emailFor("cancel");
    const made = (await bookOnce(a, sid, { email, quantity: 3 })).json();
    expect((await seats(sid)).reserved_count).toBe(3);
    const post = (path: string, body: unknown, shop = a) => t.app.inject({ method: "POST", url: `/api/v1/public/sites/${shop.slug}/bookings/${path}`, remoteAddress: nextIp(), headers: { origin: "https://some-shop.example" }, payload: body as object });

    const found = await post("lookup", { code: made.code, email: ` ${email.toUpperCase()} ` });
    expect(found.statusCode).toBe(200);
    expect(found.json()).toMatchObject({ code: made.code, status: "NOT_CONFIRMED", canCancel: true, quantity: 3 });
    const wrongEmail = await post("lookup", { code: made.code, email: emailFor("other") });
    const wrongCode = await post("lookup", { code: "SES-9999-999", email });
    expect(wrongEmail.statusCode).toBe(404);
    expect(wrongCode.statusCode).toBe(404);
    expect(wrongEmail.json().error.message).toBe(wrongCode.json().error.message); // nothing says which one was wrong
    expect((await post("lookup", { code: made.code, email }, b)).statusCode).toBe(404); // another shop's page does not know the code

    const full = await bookOnce(a, sid);
    expect(full.statusCode).toBe(409); // the session is full
    const cancelled = await post("cancel", { code: made.code, email, reason: "  Plans changed  " });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ status: "CANCELLED", cancelledBy: "GUEST", cancelReason: "Plans changed", canCancel: false });
    expect((await seats(sid)).reserved_count).toBe(0);
    expect((await bookOnce(a, sid, { quantity: 3 })).statusCode).toBe(201); // the freed seats can be booked again

    const again = await post("cancel", { code: made.code, email });
    expect(again.statusCode).toBe(409);
    expect(again.json().error.code).toBe("NOT_CANCELLABLE");
    await drain(t);
    expect(t.emails.sent.some((m) => m.to === email && m.subject === `Booking ${made.code} cancelled`)).toBe(true);
    const owner = (await t.pool.query<{ contact_email: string }>("select contact_email from organizations where id = $1", [a.orgId])).rows[0]!.contact_email;
    expect(t.emails.sent.some((m) => m.to === owner && m.subject === `Booking ${made.code} cancelled by the guest`)).toBe(true);
    const log = await t.pool.query("select action from audit_logs where organization_id = $1 and action = 'booking.cancel_by_guest'", [a.orgId]);
    expect(log.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("cannot be cancelled by the guest once the session started or closed, or the guest checked in", async () => {
    const sid = await session(a, { days: 44 });
    const email = emailFor("late");
    const made = (await bookOnce(a, sid, { email })).json();
    const cancel = () => t.app.inject({ method: "POST", url: `/api/v1/public/sites/${a.slug}/bookings/cancel`, remoteAddress: nextIp(), payload: { code: made.code, email } });
    await t.pool.query("update bookings set status = 'CHECKED_IN', status_before_check_in = 'NOT_CONFIRMED' where organization_id = $1 and booking_code = $2", [a.orgId, made.code]);
    expect((await cancel()).statusCode).toBe(409);
    await t.pool.query("update bookings set status = 'CONFIRMED' where organization_id = $1 and booking_code = $2", [a.orgId, made.code]);
    await t.pool.query("update workshop_sessions set status = 'CLOSED' where id = $1", [sid]);
    expect((await cancel()).json().error.code).toBe("NOT_CANCELLABLE");
    await t.pool.query("update workshop_sessions set status = 'RUNNING', starts_at = now() - interval '1 hour' where id = $1", [sid]);
    expect((await cancel()).json().error.code).toBe("NOT_CANCELLABLE");
    expect((await seats(sid)).reserved_count).toBe(1); // nothing was given back
  });

  it("the public endpoints answer a cross-origin call (every shop is another origin), the private ones still refuse it", async () => {
    const site = await t.app.inject({ method: "POST", url: `/api/v1/public/sites/${a.slug}/bookings/lookup`, remoteAddress: nextIp(), headers: { origin: "https://custom-domain.example" }, payload: { code: "SES-0001-001", email: "x@example.test" } });
    expect(site.statusCode).toBe(404); // reached the endpoint (not 403)
    const priv = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", remoteAddress: nextIp(), headers: { origin: "https://custom-domain.example" }, payload: { email: "x@example.test", password: "x" } });
    expect(priv.statusCode).toBe(403);
  });

  it("the database keeps a booking as it was made and payments only grow", async () => {
    const sid = await session(a, { days: 45 });
    const made = (await bookOnce(a, sid, { quantity: 2 })).json();
    const upd = (sql: string) => t.pool.query(sql.replace("$CODE", made.code).replace("$ORG", a.orgId));
    await expect(upd("update bookings set total_amount = 1 where booking_code = '$CODE' and organization_id = '$ORG'")).rejects.toThrow(/cannot be changed/);
    await expect(upd("update bookings set quantity = 9 where booking_code = '$CODE' and organization_id = '$ORG'")).rejects.toThrow(/cannot be changed/);
    await expect(upd("update bookings set snapshot = '{}' where booking_code = '$CODE' and organization_id = '$ORG'")).rejects.toThrow(/cannot be changed/);
    await upd("update bookings set special_request = 'edited' where booking_code = '$CODE' and organization_id = '$ORG'"); // the rest can change
    const id = (await t.pool.query<{ id: string }>("select id from bookings where booking_code = $1 and organization_id = $2", [made.code, a.orgId])).rows[0]!.id;
    const pay = await t.pool.query<{ id: string }>("insert into payments (organization_id, booking_id, type, amount, currency, method) values ($1, $2, 'PAYMENT', 500000, 'VND', 'CASH') returning id", [a.orgId, id]);
    await expect(t.pool.query("update payments set amount = 1 where id = $1", [pay.rows[0]!.id])).rejects.toThrow(/append only/);
    await expect(t.pool.query("delete from payments where id = $1", [pay.rows[0]!.id])).rejects.toThrow(/append only/);
    await expect(t.pool.query("insert into payments (organization_id, booking_id, type, amount, currency, method) values ($1, $2, 'PAYMENT', 0, 'VND', 'CASH')", [a.orgId, id])).rejects.toThrow(/payments_amount/);
    // a payment cannot point at a booking of another shop
    await expect(t.pool.query("insert into payments (organization_id, booking_id, type, amount, currency, method) values ($1, $2, 'PAYMENT', 1, 'VND', 'CASH')", [b.orgId, id])).rejects.toThrow(/payments_booking_fk/);
  });

  it("only SessionCapacityService writes reserved_count in the code (CLAUDE.md: seats change only there)", () => {
    const root = join(__dirname, "..");
    const files: string[] = [];
    const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.includes(join("db", "schema"))) files.push(p); } };
    walk(root);
    const writers = files.filter((f) => /reservedCount\s*:\s*(sql|\w+\()/.test(readFileSync(f, "utf8")) || /reserved_count\s*=/.test(readFileSync(f, "utf8")));
    expect(writers.map((f) => f.replace(root, "").replace(/\\/g, "/"))).toEqual(["/bookings/session-capacity.service.ts"]);
  });
});
