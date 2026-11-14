import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The lists of the platform administrator on a real PostgreSQL (FR-ADM-10 to FR-ADM-14): workshops, sessions, bookings, customers and landing pages of every shop.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string; name: string; workshopId: string; title: string; timezone: string }
let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.8`;

d("the lists of the administrator", () => {
  let t: TestApp;
  let admin: string;
  let a: Shop;
  let b: Shop;
  const rareCode = `SES-${String(900_000 + Math.floor(Math.random() * 99_000))}`;
  const marker = unique("zzz"); // a word only this run writes in a history (the database keeps what earlier runs wrote)
  let guestEmail: string;
  let accountId: string;
  const ids = {} as Record<"s1" | "s2" | "sGood" | "b1" | "b2" | "b3", string>;

  async function makeShop(label: string): Promise<Shop> {
    const name = `Shop ${unique(label)}`;
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), name), { from: nextIp() });
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const title = `Dir ${unique("w")}`;
    const w = await t.post("/workshops", { title: { en: title }, durationMinutes: 60, priceAmount: 200_000, defaultCapacity: 20, maxPerBooking: 6, categories: ["COOKING"] }, { cookie });
    await t.post(`/workshops/${w.json().id}/status`, { status: "ACTIVE" }, { cookie });
    const timezone = (await t.pool.query<{ timezone: string }>("select timezone from organizations where id = $1", [orgId])).rows[0]!.timezone;
    return { cookie, orgId, slug, name, workshopId: w.json().id as string, title, timezone };
  }
  async function session(shop: Shop, startMinutes: number, status = "RUNNING", notes: unknown[] = [], code?: string): Promise<string> {
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [shop.orgId])).rows[0]!.n;
    return (await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code, session_notes)
       select $1, $2, s, s, s + interval '1 hour', 20, $3, $4, $5::jsonb from (select now() + $6::numeric * interval '1 minute' as s) x returning id`,
      [shop.orgId, shop.workshopId, status, code ?? `SES-${String(seq).padStart(4, "0")}`, JSON.stringify(notes), startMinutes],
    )).rows[0]!.id;
  }
  const manual = async (shop: Shop, sessionId: string, email: string): Promise<string> => {
    const res = await t.post("/bookings", { sessionId, quantity: 2, source: "WALK_IN", fullName: "Dir Guest", email }, { cookie: shop.cookie, headers: { "idempotency-key": `dir-${unique("k")}-key` } });
    if (res.statusCode !== 201) throw new Error(`booking not made (${res.statusCode}): ${res.body}`);
    return res.json().id as string;
  };
  const get = async (path: string, cookie = admin) => t.app.inject({ method: "GET", url: `/api/v1/admin/directory/${path}`, remoteAddress: "10.1.1.1", headers: { cookie } });
  const day = (iso: string, tz: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("dirroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    a = await makeShop("dira");
    b = await makeShop("dirb");
    guestEmail = emailFor("dirguest");
    accountId = (await t.post("/auth/signup", signupBody("CUSTOMER", guestEmail), { from: nextIp() })).json().id;
    ids.s1 = await session(a, 2 * 24 * 60, "RUNNING", [{ type: "RESCHEDULED", at: new Date().toISOString(), reason: { code: "OTHER", note: `Chef is ill ${marker}` } }], rareCode);
    ids.s2 = await session(a, 5 * 24 * 60);
    ids.sGood = await session(a, -3 * 24 * 60, "CLOSED", Array.from({ length: 4 }, () => ({ type: "CLOSED", at: new Date().toISOString() })));
    ids.b1 = await manual(a, ids.s1, guestEmail);
    ids.b2 = await manual(a, ids.s2, emailFor("dirother"));
    const bs = await session(b, 3 * 24 * 60);
    ids.b3 = await manual(b, bs, guestEmail); // the same guest, in another shop
  });
  afterAll(async () => { await t.close(); });

  it("lets only the platform administrator read any of them", async () => {
    for (const path of ["workshops", "sessions", "bookings", "customers", "landing-pages"]) {
      expect((await t.app.inject({ method: "GET", url: `/api/v1/admin/directory/${path}`, remoteAddress: "10.1.1.1" })).statusCode, path).toBe(401);
      expect((await get(path, a.cookie)).statusCode, path).toBe(403);
      expect((await get(path)).statusCode, path).toBe(200);
    }
  });

  it("lists the workshops of every shop with the sessions and the bookings, found by title in any language or by shop", async () => {
    const byTitle = (await (await get(`workshops?q=${encodeURIComponent(a.title)}`)).json()).items;
    expect(byTitle).toHaveLength(1);
    expect(byTitle[0]).toMatchObject({ id: a.workshopId, title: { en: a.title }, status: "ACTIVE", priceAmount: 200_000, currency: "VND", sessions: 3, bookings: 2, rating: { average: null, count: 0 }, shop: { slug: a.slug, name: a.name } });
    expect((await (await get(`workshops?q=${encodeURIComponent(b.name)}`)).json()).items.map((x: { id: string }) => x.id)).toEqual([b.workshopId]); // by the name of the shop
    expect((await (await get(`workshops?q=${encodeURIComponent(a.title.toUpperCase())}&status=DRAFT`)).json()).items).toEqual([]);
    expect((await get("workshops?status=NOPE")).statusCode).toBe(422);
    const first = (await (await get("workshops?limit=1")).json());
    expect(first.items).toHaveLength(1);
    const second = (await (await get(`workshops?limit=1&cursor=${first.nextCursor}`)).json());
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect((await get("workshops?cursor=garbage")).statusCode).toBe(400);
  });

  it("lists the sessions of every shop, found by code, day, state, a note or the shop, and those closed for good", async () => {
    const find = async (q: string, extra = "") => (await (await get(`sessions?q=${encodeURIComponent(q)}${extra}`)).json()).items as { id: string; status: string; closedForGood: boolean; history: unknown[] }[];
    const code = rareCode; // a code few sessions have (the usual ones repeat in every shop)
    expect((await find(a.name)).map((s) => s.id).sort()).toEqual([ids.s1, ids.s2, ids.sGood].sort());
    expect((await find(a.name, "&status=CLOSED")).map((s) => s.id)).toEqual([ids.sGood]);
    expect((await find(marker)).map((s) => s.id)).toEqual([ids.s1]); // a word in the history
    // a day, in the time zone of the shop: the session is moved to a day nobody else uses (the database keeps the sessions of every earlier run)
    const rare = `${2041 + Math.floor(Math.random() * 55)}-${String(1 + Math.floor(Math.random() * 12)).padStart(2, "0")}-${String(1 + Math.floor(Math.random() * 28)).padStart(2, "0")}`;
    await t.pool.query("update workshop_sessions set starts_at = $2::timestamptz, ends_at = $2::timestamptz + interval '1 hour' where id = $1", [ids.s2, `${rare}T05:00:00Z`]);
    const startsAt = (await t.pool.query<{ starts_at: Date }>("select starts_at from workshop_sessions where id = $1", [ids.s2])).rows[0]!.starts_at.toISOString();
    expect((await find(day(startsAt, a.timezone))).map((s) => s.id)).toEqual([ids.s2]);
    expect((await find(code)).map((s) => s.id)).toEqual([ids.s1]);
    const good = await find(a.name, "&forGood=true");
    expect(good.map((s) => s.id)).toEqual([ids.sGood]);
    expect(good[0]).toMatchObject({ status: "CLOSED", closedForGood: true });
    expect(good[0]!.history).toHaveLength(4);
    expect((await find(a.name)).find((s) => s.id === ids.s1)).toMatchObject({ closedForGood: false });
    expect((await get("sessions?status=NOPE")).statusCode).toBe(422);
  });

  it("lists the bookings of every shop, found by code, guest, shop, customer id or account id, and by the day they were made", async () => {
    const find = async (query: string) => (await (await get(`bookings?${query}`)).json()).items as { id: string; code: string; paidAmount: number; accountId: string | null; customerId: string; guest: { email: string }; shop: { slug: string } }[];
    const code = (await t.pool.query<{ booking_code: string; customer_id: string }>("select booking_code, customer_id from bookings where id = $1", [ids.b1])).rows[0]!;
    expect((await find(`q=${encodeURIComponent(guestEmail)}`)).map((x) => x.id).sort()).toEqual([ids.b1, ids.b3].sort()); // the same guest in two shops
    expect((await find(`q=${encodeURIComponent(a.name)}`)).map((x) => x.id).sort()).toEqual([ids.b1, ids.b2].sort());
    expect((await find(`q=${code.booking_code}&from=2000-01-01`)).map((x) => x.id)).toContain(ids.b1);
    expect((await find(`q=${code.customer_id}`)).map((x) => x.id)).toEqual([ids.b1]); // the id of the customer of the shop
    expect((await find(`q=${accountId}`)).map((x) => x.id).sort()).toEqual([ids.b1, ids.b3].sort()); // the id of the account
    const one = (await find(`q=${code.booking_code}&from=2000-01-01`)).find((x) => x.id === ids.b1)!;
    expect(one).toMatchObject({ accountId, guest: { email: guestEmail }, shop: { slug: a.slug }, paidAmount: 0 });
    // paid: what was paid net of reversals
    expect((await t.post(`/bookings/${ids.b1}/payment`, { paid: true }, { cookie: a.cookie })).statusCode).toBe(200);
    expect((await find(`q=${encodeURIComponent(guestEmail)}`)).find((x) => x.id === ids.b1)!.paidAmount).toBe(400_000);

    const madeOn = day(new Date().toISOString(), a.timezone);
    expect((await find(`q=${encodeURIComponent(a.name)}&from=${madeOn}&to=${madeOn}`)).map((x) => x.id).sort()).toEqual([ids.b1, ids.b2].sort()); // both ends included
    expect(await find(`q=${encodeURIComponent(a.name)}&from=2000-01-01&to=2000-01-31`)).toEqual([]);
    const bad = async (query: string) => (await get(`bookings?${query}`)).json().error.details.fields;
    expect(await bad("from=2026-05-02&to=2026-05-01")).toEqual({ to: "beforeFrom" });
    expect(await bad("from=2026-02-30")).toEqual({ from: "invalid" });
  });

  it("lists the customers of the whole platform, one line for each email, the accounts that never booked, and finds them by email, name or shop", async () => {
    const find = async (q: string) => (await (await get(`customers?q=${encodeURIComponent(q)}`)).json()).items as { email: string; bookings: number; shops: string[]; hasAccount: boolean; accountId: string | null; firstBookingAt: string | null }[];
    const guest = await find(guestEmail);
    expect(guest).toHaveLength(1);
    expect(guest[0]).toMatchObject({ email: guestEmail, bookings: 2, hasAccount: true, accountId });
    expect(guest[0]!.shops.sort()).toEqual([a.name, b.name].sort()); // booked in two shops, one line
    expect((await find(b.name)).map((x) => x.email)).toContain(guestEmail); // found by the shop it booked in
    const lonely = emailFor("lonely");
    const lonelyId = (await t.post("/auth/signup", signupBody("CUSTOMER", lonely), { from: nextIp() })).json().id;
    expect(await find(lonely)).toEqual([{ email: lonely, name: expect.any(String), shops: [], bookings: 0, firstBookingAt: null, lastBookingAt: null, accountId: lonelyId, hasAccount: true }]); // an account that never booked
    expect((await find("zzzz-nobody-like-this"))).toEqual([]);
    const withoutAccount = (await find("dirother"))[0]!;
    expect(withoutAccount).toMatchObject({ bookings: 1, hasAccount: false, accountId: null });
    const body = (await (await get("customers?limit=2")).json());
    expect(body.items).toHaveLength(2);
    expect(body.total).toBeGreaterThan(2);
    expect(body.nextCursor).not.toBeNull();
  });

  it("pages every list by a keyset: one row a page, no row twice or missing, the same order as one big page, and a bad cursor is a 400", async () => {
    // (the lists keep the rows of earlier runs: the first dozen rows are compared, which is enough to cross many page borders)
    for (const [path, idOf] of [
      ["workshops", (r: { id: string }) => r.id], ["sessions", (r: { id: string }) => r.id], ["bookings", (r: { id: string }) => r.id], ["landing-pages", (r: { shop: { id: string } }) => r.shop.id],
    ] as const) {
      const big = ((await (await get(`${path}?limit=100`)).json()).items as never[]).slice(0, 12).map(idOf as (r: never) => string);
      expect(big.length, path).toBeGreaterThan(2);
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let i = 0; i < 12; i++) {
        const res = await get(`${path}?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        expect(res.statusCode, path).toBe(200);
        const body = res.json() as { items: never[]; nextCursor: string | null };
        seen.push(...body.items.map(idOf as (r: never) => string));
        cursor = body.nextCursor;
        if (!cursor) break;
      }
      expect(seen, path).toEqual(big.slice(0, seen.length));
      expect(new Set(seen).size, path).toBe(seen.length);
      expect((await get(`${path}?cursor=not-a-cursor`)).statusCode, path).toBe(400);
      expect((await get(`${path}?cursor=${Buffer.from(JSON.stringify({ t: "yesterday", id: "x" })).toString("base64url")}`)).statusCode, path).toBe(400);
    }
  });

  it("lists the shops with their landing pages and the address each is served at", async () => {
    await t.pool.query("insert into site_pages (organization_id, name, template_key) values ($1, 'Home', 'classic'), ($1, 'Autumn', 'modern')", [a.orgId]);
    const find = async (q: string) => (await (await get(`landing-pages?q=${encodeURIComponent(q)}`)).json()).items as { shop: { slug: string }; ownDomain: string | null; ownDomainVerified: boolean; liveUrl: string; pages: { name: string; isLive: boolean; version: number; templateKey: string }[] }[];
    const row = (await find(a.slug))[0]!;
    expect(row.shop.slug).toBe(a.slug);
    expect(row.pages.map((p) => p.name)).toEqual(["Home", "Autumn"]);
    expect(row.pages[0]).toMatchObject({ isLive: false, version: 0, templateKey: "classic" });
    expect(row.liveUrl).toBe(`http://${a.slug}.localtest.me:3000`);
    expect(row.ownDomain).toBeNull();
    expect((await find(b.slug))[0]!.pages).toEqual([]);
    // an own domain is the address only once it is verified
    const domain = `${unique("d")}.example.com`;
    await t.pool.query("update organizations set custom_domain = $2 where id = $1", [a.orgId, domain]);
    expect((await find(a.slug))[0]).toMatchObject({ ownDomain: domain, ownDomainVerified: false, liveUrl: `http://${a.slug}.localtest.me:3000` });
    await t.pool.query("update organizations set custom_domain_verified_at = now() where id = $1", [a.orgId]);
    expect((await find(a.slug))[0]).toMatchObject({ ownDomainVerified: true, liveUrl: `https://${domain}` });
    expect((await get(`landing-pages?q=${randomUUID()}`)).json().items).toEqual([]);
  });
});
