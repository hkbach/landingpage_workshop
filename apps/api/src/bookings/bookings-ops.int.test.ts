import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, cookieOf, drain, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// What the shop owner does with bookings and customers, on a real PostgreSQL: list, make one for a guest, check in, cancel, record the payment, and the isolation of the shops.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string; workshopId: string }
let counter = 0;
const key = (): string => `ops-${unique("k")}-${counter++}`;

d("bookings and customers of a shop", () => {
  let t: TestApp;
  let a: Shop;
  let b: Shop;

  async function makeShop(label: string): Promise<Shop> {
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const w = await t.post("/workshops", { title: { en: `Ops ${unique("w")}` }, durationMinutes: 90, priceAmount: 200_000, defaultCapacity: 10, maxPerBooking: 4, categories: ["COOKING"] }, { cookie });
    const workshopId = w.json().id as string;
    await t.post(`/workshops/${workshopId}/status`, { status: "ACTIVE" }, { cookie });
    return { cookie, orgId, slug, workshopId };
  }

  async function session(shop: Shop, opts: { capacity?: number; days?: number; status?: string } = {}): Promise<string> {
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [shop.orgId])).rows[0]!.n;
    const r = await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code)
       select $1, $2, s, s, s + interval '90 minutes', $3, $4, $5 from (select now() + $6::numeric * interval '1 day' as s) x returning id`,
      [shop.orgId, shop.workshopId, opts.capacity ?? 10, opts.status ?? "RUNNING", `SES-${String(seq).padStart(4, "0")}`, opts.days ?? 5],
    );
    return r.rows[0]!.id;
  }

  const manual = (shop: Shop, body: Record<string, unknown>, k = key()) => t.post("/bookings", body, { cookie: shop.cookie, headers: { "idempotency-key": k } });
  const act = (shop: Shop, id: string, path: string, body: unknown = {}) => t.post(`/bookings/${id}/${path}`, body, { cookie: shop.cookie });
  const seats = async (sid: string) => (await t.pool.query<{ reserved_count: number }>("select reserved_count from workshop_sessions where id = $1", [sid])).rows[0]!.reserved_count;
  /** A booking made for a guest by the shop: CONFIRMED. */
  const make = async (shop: Shop, sid: string, over: Record<string, unknown> = {}) => {
    const res = await manual(shop, { sessionId: sid, quantity: 2, source: "WALK_IN", fullName: "Walk In", ...over });
    if (res.statusCode !== 201) throw new Error(`The test booking was not made (${res.statusCode}): ${res.body}`);
    return res.json();
  };

  beforeAll(async () => {
    t = await startApp();
    a = await makeShop("opsa");
    b = await makeShop("opsb");
  });
  afterAll(async () => { await t.close(); });

  it("makes a booking for a guest: CONFIRMED at once, the price of the server, seats taken, the guest told by email when there is one, audited", async () => {
    const sid = await session(a);
    const email = emailFor("walk");
    const res = await manual(a, { sessionId: sid, quantity: 3, source: "PHONE", fullName: "  Phone Guest  ", email: ` ${email.toUpperCase()} `, phone: "+84 91 111 1111", country: "vn", specialRequest: "Vegetarian", totalAmount: 1, unitPriceAmount: 1 });
    expect(res.statusCode).toBe(201);
    const bk = res.json();
    expect(bk).toMatchObject({ status: "CONFIRMED", paymentStatus: "UNPAID", source: "PHONE", quantity: 3, unitPriceAmount: 200_000, totalAmount: 600_000, paidAmount: 0, currency: "VND" });
    expect(bk.guest).toEqual({ name: "Phone Guest", email, phone: "+84 91 111 1111", country: "VN" });
    expect(bk.code).toMatch(/^SES-\d{4}-001$/);
    expect(bk.actions.sort()).toEqual(["CANCEL", "CHECK_IN"]);
    expect(await seats(sid)).toBe(3);
    await drain(t);
    expect(t.emails.sent.some((m) => m.to === email && m.subject.startsWith(`Your booking ${bk.code} is confirmed`))).toBe(true);
    const log = await t.pool.query<{ actor_user_id: string | null }>("select actor_user_id from audit_logs where entity_id = $1 and action = 'booking.manual_create'", [bk.id]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]!.actor_user_id).not.toBeNull(); // the owner did it
    const row = (await t.pool.query("select created_by, status_changed_by from bookings where id = $1", [bk.id])).rows[0];
    expect(row.created_by).not.toBeNull();

    const noMail = await make(a, sid, { quantity: 1 });
    expect(noMail.guest.email).toBeNull();
    expect(noMail.code).toMatch(/-002$/);
  });

  it("is idempotent, and refuses a full session, a closed one, a wrong quantity, a phone booking with no contact and another shop's session", async () => {
    const sid = await session(a, { capacity: 3 });
    const k = key();
    const first = await manual(a, { sessionId: sid, quantity: 2, source: "WALK_IN", fullName: "Once" }, k);
    const second = await manual(a, { sessionId: sid, quantity: 2, source: "WALK_IN", fullName: "Once" }, k);
    expect([first.statusCode, second.statusCode]).toEqual([201, 200]);
    expect(second.json().code).toBe(first.json().code);
    expect(await seats(sid)).toBe(2);
    expect((await t.post("/bookings", { sessionId: sid, quantity: 1, source: "WALK_IN", fullName: "No key" }, { cookie: a.cookie })).statusCode).toBe(422); // the header is needed

    const full = await manual(a, { sessionId: sid, quantity: 2, source: "WALK_IN", fullName: "Too many" });
    expect(full.statusCode).toBe(409);
    expect(full.json().error).toMatchObject({ code: "SESSION_FULL", details: { remaining: 1 } });
    const closed = await session(a, { status: "CLOSED" });
    expect((await manual(a, { sessionId: closed, quantity: 1, source: "WALK_IN", fullName: "Late" })).json().error.code).toBe("NOT_BOOKABLE");
    const ok = await session(a);
    expect((await manual(a, { sessionId: ok, quantity: 5, source: "WALK_IN", fullName: "Big" })).json().error.details.fields).toEqual({ quantity: "quantityRange" });
    expect((await manual(a, { sessionId: ok, quantity: 1, source: "PHONE", fullName: "No contact" })).json().error.details.fields).toHaveProperty("phone", "required");
    expect((await manual(a, { sessionId: ok, quantity: 1, source: "ONLINE", fullName: "x" })).statusCode).toBe(422); // a guest books online by himself
    expect((await manual(a, { sessionId: await session(b), quantity: 1, source: "WALK_IN", fullName: "Foreign" })).json().error.details.fields).toEqual({ sessionId: "unknown" });
    expect(await seats(ok)).toBe(0);
  });

  it("a walk-in can join a session that has started while seats remain, even when it is not RUNNING yet", async () => {
    const sid = await session(a, { days: -0.02, status: "RUNNING" }); // started half an hour ago, ends in an hour
    expect((await manual(a, { sessionId: sid, quantity: 1, source: "WALK_IN", fullName: "Late arrival" })).statusCode).toBe(201);
    const open = await session(a, { days: 3, status: "OPEN" });
    expect((await manual(a, { sessionId: open, quantity: 1, source: "PHONE", fullName: "Booked early", phone: "+84 90 222 2222" })).statusCode).toBe(201);
    const over = await session(a, { days: -1, status: "RUNNING" });
    expect((await manual(a, { sessionId: over, quantity: 1, source: "WALK_IN", fullName: "Too late" })).json().error.code).toBe("NOT_BOOKABLE"); // it ended yesterday
  });

  it("lists with filters (status, session, the DAY of the session in the shop's time zone, a search) and a cursor, and shows one booking with its payments", async () => {
    const sid = await session(a, { days: 9 });
    const made = [await make(a, sid, { fullName: `Alpha ${unique("x")}`, email: emailFor("alpha") }), await make(a, sid, { fullName: "Bravo Guest", phone: "+84 93 333 3333" }), await make(a, sid, { fullName: "Charlie" })];
    await act(a, made[2].id, "cancel", { reason: "No show" });
    const bySession = (await t.get(`/bookings?sessionId=${sid}`, { cookie: a.cookie })).json();
    expect(bySession.items.map((x: { id: string }) => x.id)).toEqual([made[2].id, made[1].id, made[0].id]); // newest first
    expect((await t.get(`/bookings?sessionId=${sid}&status=CANCELLED`, { cookie: a.cookie })).json().items.map((x: { id: string }) => x.id)).toEqual([made[2].id]);
    expect((await t.get(`/bookings?sessionId=${sid}&q=bravo`, { cookie: a.cookie })).json().items).toHaveLength(1);
    expect((await t.get(`/bookings?sessionId=${sid}&q=${encodeURIComponent("+84 93")}`, { cookie: a.cookie })).json().items).toHaveLength(1);
    expect((await t.get(`/bookings?sessionId=${sid}&q=${made[0].code}`, { cookie: a.cookie })).json().items).toHaveLength(1);
    expect((await t.get(`/bookings?sessionId=${sid}&q=%25`, { cookie: a.cookie })).json().items).toHaveLength(0); // "%" is text
    expect((await t.get(`/bookings?sessionId=${sid}&paymentStatus=PAID`, { cookie: a.cookie })).json().items).toHaveLength(0);
    const page1 = (await t.get(`/bookings?sessionId=${sid}&limit=2`, { cookie: a.cookie })).json();
    const page2 = (await t.get(`/bookings?sessionId=${sid}&limit=2&cursor=${encodeURIComponent(page1.nextCursor)}`, { cookie: a.cookie })).json();
    expect([...page1.items, ...page2.items].map((x: { id: string }) => x.id)).toEqual([made[2].id, made[1].id, made[0].id]);
    expect(page2.nextCursor).toBeNull();

    const start = new Date((await t.pool.query<{ s: Date }>("select starts_at as s from workshop_sessions where id = $1", [sid])).rows[0]!.s);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(start); // the day in Vietnam
    const onDay = (await t.get(`/bookings?date=${day}&limit=100`, { cookie: a.cookie })).json().items.map((x: { id: string }) => x.id);
    expect(onDay).toEqual(expect.arrayContaining([made[0].id, made[1].id, made[2].id]));
    expect((await t.get("/bookings?date=2020-01-01", { cookie: a.cookie })).json().items).toHaveLength(0);
    expect((await t.get("/bookings?date=2026-02-30", { cookie: a.cookie })).statusCode).toBe(422);
    expect((await t.get("/bookings?cursor=bad", { cookie: a.cookie })).statusCode).toBe(400);

    const detail = (await t.get(`/bookings/${made[0].id}`, { cookie: a.cookie })).json();
    expect(detail).toMatchObject({ id: made[0].id, code: made[0].code, payments: [], session: { id: sid }, workshop: { id: a.workshopId } });
    expect(detail.workshop.title.en).toMatch(/^Ops /);
  });

  it("checks in and undoes it back to EXACTLY the status before, with the state machine of the shared rules", async () => {
    const sid = await session(a, { days: 10 });
    const confirmed = await make(a, sid);
    const notConfirmed = await make(a, sid);
    await t.pool.query("update bookings set status = 'NOT_CONFIRMED' where id = $1", [notConfirmed.id]);

    const c1 = (await act(a, confirmed.id, "check-in")).json();
    expect(c1).toMatchObject({ status: "CHECKED_IN", checkedInAt: expect.any(String) });
    expect(c1.actions.sort()).toEqual(["UNDO_CHECK_IN"]);
    expect((await act(a, confirmed.id, "check-in")).json().error.code).toBe("INVALID_TRANSITION"); // already checked in
    expect((await act(a, confirmed.id, "cancel", { reason: "x" })).statusCode).toBe(409); // a checked-in booking cannot be cancelled
    expect((await act(a, confirmed.id, "uncheck-in")).json()).toMatchObject({ status: "CONFIRMED", checkedInAt: null });

    await act(a, notConfirmed.id, "check-in");
    expect((await act(a, notConfirmed.id, "uncheck-in")).json().status).toBe("NOT_CONFIRMED"); // not CONFIRMED: back to what it was
    expect((await act(a, notConfirmed.id, "uncheck-in")).json().error.code).toBe("INVALID_TRANSITION");
    expect(await seats(sid)).toBe(4); // check-in and undo never change the seats (BR-07)

    await act(a, confirmed.id, "check-in");
    await t.pool.query("update workshop_sessions set status = 'CLOSED' where id = $1", [sid]);
    expect((await act(a, confirmed.id, "uncheck-in")).json().error.code).toBe("INVALID_TRANSITION"); // a closed session is final
    expect((await act(a, notConfirmed.id, "check-in")).json().error.code).toBe("INVALID_TRANSITION");
    const audit = await t.pool.query<{ action: string }>("select action from audit_logs where entity_id = $1 order by created_at", [confirmed.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(["booking.manual_create", "booking.check_in", "booking.undo_check_in", "booking.check_in"]);
  });

  it("cancels with a reason: seats come back, the guest is told by email, and a cancelled booking never comes back", async () => {
    const sid = await session(a, { capacity: 4, days: 11 });
    const email = emailFor("cancelled");
    const bk = await make(a, sid, { quantity: 4, email });
    expect(await seats(sid)).toBe(4);
    expect((await act(a, bk.id, "cancel", {})).statusCode).toBe(422); // a reason is required
    expect((await act(a, bk.id, "cancel", { reason: "   " })).statusCode).toBe(422);
    const done = (await act(a, bk.id, "cancel", { reason: "  Studio closed  " })).json();
    expect(done).toMatchObject({ status: "CANCELLED", cancelledBy: "SHOP", cancelReason: "Studio closed", actions: [] });
    expect(await seats(sid)).toBe(0);
    expect((await make(a, sid, { quantity: 4 })).code).toMatch(/-002$/); // the seats can be booked again (the number goes on)
    for (const path of ["check-in", "uncheck-in"]) expect((await act(a, bk.id, path)).json().error.code, path).toBe("INVALID_TRANSITION");
    expect((await act(a, bk.id, "cancel", { reason: "again" })).json().error.code).toBe("INVALID_TRANSITION");
    expect((await act(a, bk.id, "payment", { paid: true })).json().error.code).toBe("INVALID_STATE");
    await drain(t);
    const mail = t.emails.sent.find((m) => m.to === email && m.subject.startsWith(`Your booking ${bk.code} has been cancelled`))!;
    expect(mail.text).toContain("has cancelled your booking");
    expect(mail.text).toContain("Studio closed");
  });

  it("records a payment: a PAYMENT for what is owed, PAID, checked in; unpaid is a REVERSAL, not a refund, and goes back; nothing is edited", async () => {
    const sid = await session(a, { days: 12 });
    const email = emailFor("paid");
    const bk = await make(a, sid, { quantity: 2, email }); // 400 000
    const paid = (await act(a, bk.id, "payment", { paid: true, method: "CARD", note: "  Visa  " })).json();
    expect(paid).toMatchObject({ paymentStatus: "PAID", status: "CHECKED_IN", paidAmount: 400_000 });
    expect(paid.payments).toHaveLength(1);
    expect(paid.payments[0]).toMatchObject({ type: "PAYMENT", amount: 400_000, method: "CARD", note: "Visa", currency: "VND" });
    expect((await act(a, bk.id, "payment", { paid: true })).json().payments).toHaveLength(1); // asking again changes nothing
    await drain(t);
    expect(t.emails.sent.filter((m) => m.to === email && m.subject.startsWith(`Payment received for booking ${bk.code}`))).toHaveLength(1);

    const back = (await act(a, bk.id, "payment", { paid: false, note: "Mistake" })).json();
    expect(back).toMatchObject({ paymentStatus: "UNPAID", status: "CONFIRMED", paidAmount: 0, checkedInAt: null });
    expect(back.payments.map((p: { type: string; amount: number }) => [p.type, p.amount])).toEqual([["PAYMENT", 400_000], ["REVERSAL", 400_000]]);
    expect((await act(a, bk.id, "payment", { paid: false })).json().payments).toHaveLength(2); // already unpaid: nothing to put back

    // a part was paid before: the payment covers only what is still owed
    const fresh = await make(a, sid, { quantity: 1 }); // 200 000
    await t.pool.query("insert into payments (organization_id, booking_id, type, amount, currency, method) values ($1, $2, 'PAYMENT', 50000, 'VND', 'CASH')", [a.orgId, fresh.id]);
    const rest = (await act(a, fresh.id, "payment", { paid: true })).json();
    expect(rest.payments.map((p: { amount: number }) => p.amount)).toEqual([50_000, 150_000]);
    expect(rest).toMatchObject({ paymentStatus: "PAID", paidAmount: 200_000 });

    await expect(t.pool.query("delete from payments where booking_id = $1", [fresh.id])).rejects.toThrow(/append only/);
    expect((await act(a, bk.id, "payment", { paid: "yes" })).statusCode).toBe(422);
    expect((await act(a, bk.id, "payment", { paid: true, method: "BITCOIN" })).statusCode).toBe(422);
  });

  it("takes no payment for a booking of a COMPLETED session, and a closed session still takes it", async () => {
    const sid = await session(a, { days: 13 });
    const bk = await make(a, sid);
    await t.pool.query("update workshop_sessions set status = 'CLOSED' where id = $1", [sid]);
    expect((await act(a, bk.id, "payment", { paid: true })).json()).toMatchObject({ paymentStatus: "PAID", status: "CHECKED_IN" }); // after the session is closed, before it is completed
    await t.pool.query("update workshop_sessions set status = 'COMPLETED' where id = $1", [sid]);
    const refused = await act(a, bk.id, "payment", { paid: false });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe("SESSION_COMPLETED");
  });

  it("lists the customers of the shop with their counts, searches them, and shows one with all the bookings", async () => {
    const sid = await session(a, { days: 14 });
    const email = emailFor("loyal");
    const tag = unique("cu");
    await make(a, sid, { fullName: `Loyal ${tag}`, email });
    await make(a, sid, { fullName: "Loyal again", email, quantity: 1 });
    const list = (await t.get(`/customers?q=${tag}`, { cookie: a.cookie })).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ fullName: `Loyal ${tag}`, email, bookingCount: 2 });
    expect(list.items[0].lastBookingAt).toEqual(expect.any(String));
    const detail = (await t.get(`/customers/${list.items[0].id}`, { cookie: a.cookie })).json();
    expect(detail.bookings).toHaveLength(2);
    expect(detail.bookings.map((x: { guestName: string }) => x.guestName).sort()).toEqual(["Loyal again", `Loyal ${tag}`]);
    expect((await t.get(`/customers?q=${encodeURIComponent(email.slice(0, 12))}`, { cookie: a.cookie })).json().items.length).toBeGreaterThanOrEqual(1);
    const p1 = (await t.get("/customers?limit=2", { cookie: a.cookie })).json();
    expect(p1.items).toHaveLength(2);
    const p2 = (await t.get(`/customers?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`, { cookie: a.cookie })).json();
    expect(p2.items.every((c: { id: string }) => !p1.items.some((x: { id: string }) => x.id === c.id))).toBe(true);
  });

  it("the shops are isolated: another shop's booking and customer are a 404 for every endpoint and in no list", async () => {
    const sid = await session(a, { days: 15 });
    const email = emailFor("secret");
    const mine = await make(a, sid, { fullName: `Secret ${unique("s")}`, email });
    const cust = (await t.get(`/customers?q=${encodeURIComponent(email)}`, { cookie: a.cookie })).json().items[0];
    expect((await t.get(`/bookings/${mine.id}`, { cookie: b.cookie })).statusCode).toBe(404);
    for (const [path, body] of [["check-in", {}], ["uncheck-in", {}], ["cancel", { reason: "x" }], ["payment", { paid: true }]] as const) expect((await act(b, mine.id, path, body)).statusCode, path).toBe(404);
    expect((await t.get(`/customers/${cust.id}`, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await t.get("/bookings/not-a-uuid", { cookie: b.cookie })).statusCode).toBe(404);
    expect((await t.get("/bookings?limit=100", { cookie: b.cookie })).json().items.some((x: { id: string }) => x.id === mine.id)).toBe(false);
    expect((await t.get(`/bookings?q=${mine.code}`, { cookie: b.cookie })).json().items).toHaveLength(0);
    expect((await t.get(`/bookings?sessionId=${sid}`, { cookie: b.cookie })).json().items).toHaveLength(0); // a session id of another shop finds nothing
    expect((await t.get(`/customers?q=${encodeURIComponent(email)}`, { cookie: b.cookie })).json().items).toHaveLength(0);
    expect((await t.get(`/bookings/${mine.id}`, { cookie: a.cookie })).json()).toMatchObject({ status: "CONFIRMED", paymentStatus: "UNPAID" }); // untouched
    expect((await t.get("/bookings")).statusCode).toBe(401);
  });

  it("a suspended shop can read its bookings but not change them", async () => {
    const sid = await session(b, { days: 16 });
    const bk = await make(b, sid);
    await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [b.orgId]);
    try {
      expect((await t.get(`/bookings/${bk.id}`, { cookie: b.cookie })).statusCode).toBe(200);
      expect((await act(b, bk.id, "check-in")).json().error.code).toBe("SHOP_SUSPENDED");
      expect((await manual(b, { sessionId: sid, quantity: 1, source: "WALK_IN", fullName: "x" })).statusCode).toBe(403);
      expect((await act(b, bk.id, "payment", { paid: true })).statusCode).toBe(403);
    } finally {
      await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [b.orgId]);
    }
  });
});
