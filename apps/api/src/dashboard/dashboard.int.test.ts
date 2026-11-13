import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The overview of the shop owner on a real PostgreSQL (FR-PAY-03): the numbers that need action, the cards and the chart, worked out from a small shop whose figures are known.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; workshopId: string }
let counter = 0;

d("the overview of a shop", () => {
  let t: TestApp;
  let a: Shop;
  let b: Shop;
  let timezone = "UTC";
  const ids: Record<string, string> = {};

  async function makeShop(label: string): Promise<Shop> {
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
    const cookie = cookieOf(res);
    const orgId = res.json().organization.id as string;
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const w = await t.post("/workshops", { title: { en: `Dash ${unique("w")}` }, durationMinutes: 60, priceAmount: 200_000, defaultCapacity: 10, maxPerBooking: 6, categories: ["COOKING"] }, { cookie });
    const workshopId = w.json().id as string;
    await t.post(`/workshops/${workshopId}/status`, { status: "ACTIVE" }, { cookie });
    return { cookie, orgId, workshopId };
  }

  /** A session starting `minutes` from now (negative: in the past), with the given status. */
  async function session(shop: Shop, minutes: number, status: string, capacity = 10): Promise<string> {
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [shop.orgId])).rows[0]!.n;
    const r = await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code)
       select $1, $2, s, s, s + interval '60 minutes', $3, $4, $5 from (select now() + $6::numeric * interval '1 minute' as s) x returning id`,
      [shop.orgId, shop.workshopId, capacity, status, `SES-${String(seq).padStart(4, "0")}`, minutes],
    );
    return r.rows[0]!.id;
  }

  const manual = async (shop: Shop, sessionId: string, quantity: number, email?: string) => {
    const res = await t.post("/bookings", { sessionId, quantity, source: "WALK_IN", fullName: "Walk In", ...(email ? { email } : {}) }, { cookie: shop.cookie, headers: { "idempotency-key": `dash-${unique("k")}-${counter++}` } });
    if (res.statusCode !== 201) throw new Error(`booking not made (${res.statusCode}): ${res.body}`);
    return res.json().id as string;
  };

  /** A booking written straight into the table, for a session the API would no longer take bookings for (a closed or a past one). */
  async function inject(shop: Shop, sessionId: string, status: string, quantity = 1): Promise<string> {
    const c = (await t.pool.query<{ id: string }>("insert into customers (organization_id, full_name) values ($1, 'Injected') returning id", [shop.orgId])).rows[0]!.id;
    const code = `SES-9${String(counter++).padStart(3, "0")}-001`;
    const r = await t.pool.query<{ id: string }>(
      `insert into bookings (organization_id, booking_code, session_id, workshop_id, customer_id, source, quantity, status, unit_price_amount, total_amount, currency, guest_name, snapshot)
       values ($1, $2, $3, $4, $5, 'WALK_IN', $6, $7, 200000, $6 * 200000, 'VND', 'Injected', $8::jsonb) returning id`,
      [shop.orgId, code, sessionId, shop.workshopId, c, quantity, status, JSON.stringify({ workshopTitle: { en: "x" }, sessionCode: "SES-0001", startsAt: new Date().toISOString(), endsAt: new Date().toISOString(), timezone: "UTC", address: "" })],
    );
    return r.rows[0]!.id;
  }

  const summary = async (shop: Shop = a) => (await t.get("/dashboard/summary", { cookie: shop.cookie })).json();
  const stats = async (period: string, shop: Shop = a) => t.get(`/dashboard/booking-stats?period=${period}`, { cookie: shop.cookie });
  const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(iso));

  beforeAll(async () => {
    t = await startApp();
    a = await makeShop("dasha");
    b = await makeShop("dashb");
    timezone = (await t.pool.query<{ timezone: string }>("select timezone from organizations where id = $1", [a.orgId])).rows[0]!.timezone;
  });
  afterAll(async () => { await t.close(); });

  it("is all zeros for a shop with nothing yet, and answers only for the shop of the session", async () => {
    const s = await summary();
    expect(s).toMatchObject({ currency: "VND", kpis: { bookingsToday: 0, upcomingSessions: 0, notConfirmed: 0, awaitingPaymentConfirmation: { count: 0, amount: 0 }, toPayAtStudio: { count: 0, amount: 0 } } });
    expect(s.cards).toMatchObject({
      bookings: { total: 0, guests: 0, lostRate: 0 }, workshops: { active: 1, draft: 0 }, sessions: { upcoming: 0, seatRate: 0, closedToComplete: 0, completed: 0 },
      customers: { total: 0, returning: 0 }, income: { income: 0, fees: 0, profit: 0 }, landingPages: { pages: 0, max: 2, live: 0 },
    });
    expect(s.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await t.get("/dashboard/summary")).statusCode).toBe(401);
    const customer = await t.post("/auth/signup", signupBody("CUSTOMER", emailFor("dashcust")), { from: "10.9.9.9" });
    expect((await t.get("/dashboard/summary", { cookie: cookieOf(customer) })).statusCode).toBe(403);
  });

  it("counts what needs action: bookings today, not confirmed, unpaid ones to confirm and to collect, and the seats that are taken", async () => {
    ids.s1 = await session(a, 1, "RUNNING"); // starts in a minute (today, unless the clock is about to turn midnight)
    ids.s2 = await session(a, 3 * 24 * 60, "RUNNING"); // in three days
    ids.s3 = await session(a, -180, "CLOSED"); // over, closed, not completed yet
    ids.s4 = await session(a, -10 * 24 * 60, "COMPLETED");
    ids.b1 = await manual(a, ids.s1, 2, emailFor("returning")); // CONFIRMED
    ids.b2 = await manual(a, ids.s1, 1);
    await t.pool.query("update bookings set status = 'NOT_CONFIRMED' where id = $1", [ids.b2]);
    ids.b3 = await manual(a, ids.s1, 1); // cancelled below: it frees its seat and counts for nothing
    expect((await t.post(`/bookings/${ids.b3}/cancel`, { reason: "Changed plans" }, { cookie: a.cookie })).statusCode).toBe(200);
    const sameGuest = (await t.pool.query<{ guest_email: string; customer_id: string }>("select guest_email, customer_id from bookings where id = $1", [ids.b1])).rows[0]!;
    ids.b4 = await manual(a, ids.s2, 3, sameGuest.guest_email); // the same guest again: a returning customer
    ids.b5 = await inject(a, ids.s3, "CONFIRMED", 1); // unpaid, its session is closed: waits for the shop to confirm the payment
    ids.b6 = await inject(a, ids.s4, "CHECKED_IN", 2); // came, ten days ago

    const s = await summary();
    const todayCount = (await t.pool.query<{ id: string; starts_at: Date }>("select b.id, s.starts_at from bookings b join workshop_sessions s on s.id = b.session_id where b.organization_id = $1 and b.status <> 'CANCELLED'", [a.orgId])).rows.filter((r) => dayKey(r.starts_at.toISOString()) === s.today).length;
    expect(s.kpis.bookingsToday).toBe(todayCount); // the bookings of the sessions of today in the time zone of the shop
    expect(s.kpis.upcomingSessions).toBe(2);
    expect(s.kpis.notConfirmed).toBe(1);
    expect(s.kpis.toPayAtStudio).toEqual({ count: 3, amount: 1_200_000 }); // b1 (2), b2 (1), b4 (3) guests at 200 000
    expect(s.kpis.awaitingPaymentConfirmation).toEqual({ count: 1, amount: 200_000 });
    expect(s.cards.sessions).toMatchObject({ upcoming: 2, reserved: 6, capacity: 20, seatRate: 0.3, closedToComplete: 1, completed: 1 });
    expect(s.cards.customers.returning).toBe(1);
    expect((await t.pool.query<{ n: number }>("select count(*)::int as n from customers where organization_id = $1", [a.orgId])).rows[0]!.n).toBe(s.cards.customers.total);
  });

  it("charts the bookings of each day or month by what became of them, on the day of their session", async () => {
    const day = await (await stats("1m")).json();
    expect(day).toMatchObject({ period: "1m", unit: "day", timezone });
    expect(day.series).toHaveLength(30);
    expect(day.keys).toHaveLength(30);
    for (const p of day.series) expect(p.total).toBe(p.attended + p.upcoming + p.lost);
    // b6: two guests who came ten days ago
    const startsAt = (await t.pool.query<{ starts_at: Date }>("select starts_at from workshop_sessions where id = $1", [ids.s4])).rows[0]!.starts_at.toISOString();
    expect(day.series.find((p: { key: string }) => p.key === dayKey(startsAt))).toMatchObject({ attended: 1, guests: 2 });
    expect(day.totals.attended).toBeGreaterThanOrEqual(1);
    expect(day.totals.lost).toBe(1); // b3, cancelled, on the day of its session (today)
    expect(day.totals.total).toBe(day.series.reduce((n: number, p: { total: number }) => n + p.total, 0));

    for (const [period, length] of [["3m", 3], ["6m", 6], ["12m", 12]] as const) {
      const r = await (await stats(period)).json();
      expect([r.unit, r.series.length]).toEqual(["month", length]);
    }
    const twelve = await (await stats("12m")).json();
    expect(twelve.totals.total).toBeGreaterThanOrEqual(5); // all the bookings but those of the days to come after this month
    expect((await stats("2y")).statusCode).toBe(422);
    expect((await (await stats("1m")).json()).period).toBe("1m"); // the default is also 1m
    const other = await (await stats("12m", b)).json();
    expect(other.totals.total).toBe(0); // the other shop has none of them
  });

  it("puts the income of this month and the landing pages on their cards, and a booking paid moves from 'to collect' to the income", async () => {
    await t.pool.query("insert into site_pages (organization_id, name) values ($1, 'Home')", [a.orgId]);
    const before = await summary();
    expect(before.cards.landingPages).toEqual({ pages: 1, max: 2, live: 0 });
    expect(before.cards.income).toMatchObject({ income: 0, profit: 0 });

    expect((await t.post(`/bookings/${ids.b1}/payment`, { paid: true }, { cookie: a.cookie })).statusCode).toBe(200); // 2 guests x 200 000 = 400 000, at 10% + 10% of the price
    const after = await summary();
    expect(after.cards.income).toMatchObject({ income: 400_000, fees: 80_000, profit: 320_000 });
    expect(after.kpis.toPayAtStudio).toEqual({ count: 2, amount: 800_000 }); // b1 is paid now
    expect(after.cards.bookings.total).toBe((await (await stats("3m")).json()).series.at(-1).total); // the card is the last month of the chart
    expect((await summary(b)).cards.income).toMatchObject({ income: 0 }); // not the other shop's
  });
});
