import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The area of the customer on a real PostgreSQL (FR-CUST-01): the profile, the bookings with check-in and rating, the ratings for the shop and the platform, favorites and the Workshops page.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string; name: string; w1: string; w2: string }
interface Account { cookie: string; id: string; email: string }
let counter = 0;
let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.3`;

d("the area of a customer", () => {
  let t: TestApp;
  let admin: string;
  let a: Shop;
  let b: Shop;
  let c1: Account;
  let c2: Account;
  const ids = {} as Record<"far" | "soon" | "bSession" | "bFar" | "bSoon" | "bShopB" | "bOther" | "bNotConfirmed" | "bCancelled" | "ended" | "bRate" | "bNotCheckedIn" | "rating", string>;

  async function makeShop(label: string): Promise<Shop> {
    const name = `Shop ${unique(label)}`;
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), name), { from: nextIp() });
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const make = async (title: string, category: string) => {
      const w = await t.post("/workshops", { title: { en: title }, durationMinutes: 60, priceAmount: 200_000, defaultCapacity: 40, maxPerBooking: 6, categories: [category] }, { cookie });
      await t.post(`/workshops/${w.json().id}/status`, { status: "ACTIVE" }, { cookie });
      return w.json().id as string;
    };
    return { cookie, orgId, slug, name, w1: await make(`Cook ${unique("w")}`, "COOKING"), w2: await make(`Bake ${unique("w")}`, "BAKING") };
  }

  const makeAccount = async (label: string): Promise<Account> => {
    const email = emailFor(label);
    const res = await t.post("/auth/signup", signupBody("CUSTOMER", email), { from: nextIp() });
    return { cookie: cookieOf(res), id: res.json().id as string, email };
  };

  async function session(shop: Shop, workshopId: string, startMinutes: number, status = "RUNNING"): Promise<string> {
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [shop.orgId])).rows[0]!.n;
    const r = await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code)
       select $1, $2, s, s, s + interval '60 minutes', 40, $3, $4 from (select now() + $5::numeric * interval '1 minute' as s) x returning id`,
      [shop.orgId, workshopId, status, `SES-${String(seq).padStart(4, "0")}`, startMinutes],
    );
    return r.rows[0]!.id;
  }

  /** A booking for the account made by the shop through the API (CONFIRMED). */
  async function manual(shop: Shop, sessionId: string, email: string): Promise<string> {
    const res = await t.post("/bookings", { sessionId, quantity: 1, source: "WALK_IN", fullName: "Walk In", email }, { cookie: shop.cookie, headers: { "idempotency-key": `cust-${unique("k")}-${counter++}` } });
    if (res.statusCode !== 201) throw new Error(`booking not made (${res.statusCode}): ${res.body}`);
    return res.json().id as string;
  }

  /** A booking written into the table (for a session the API no longer takes bookings for). */
  async function inject(shop: Shop, workshopId: string, sessionId: string, email: string, status: string): Promise<string> {
    const c = (await t.pool.query<{ id: string }>("insert into customers (organization_id, full_name, email_normalized) values ($1, 'Injected', $2) returning id", [shop.orgId, `${unique("i")}@example.test`])).rows[0]!.id;
    const code = `SES-9${String(counter++).padStart(3, "0")}-001`;
    const r = await t.pool.query<{ id: string }>(
      `insert into bookings (organization_id, booking_code, session_id, workshop_id, customer_id, source, quantity, status, unit_price_amount, total_amount, currency, guest_name, guest_email, snapshot)
       values ($1, $2, $3, $4, $5, 'WALK_IN', 1, $6, 200000, 200000, 'VND', 'Injected', $7, $8::jsonb) returning id`,
      [shop.orgId, code, sessionId, workshopId, c, status, email, JSON.stringify({ workshopTitle: { en: "x" }, sessionCode: "SES-0001", startsAt: new Date().toISOString(), endsAt: new Date().toISOString(), timezone: "Asia/Ho_Chi_Minh", address: "1 Test Street" })],
    );
    return r.rows[0]!.id;
  }

  const get = (c: Account, path: string) => t.get(`/customer/${c.id}${path}`, { cookie: c.cookie });
  const send = (method: "PATCH" | "PUT" | "DELETE", c: Account, path: string, payload?: unknown) =>
    t.app.inject({ method, url: `/api/v1/customer/${c.id}${path}`, ...(payload !== undefined ? { payload: payload as object } : {}), remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: c.cookie } });
  const post = (c: Account, path: string, body: unknown = {}) => t.post(`/customer/${c.id}${path}`, body, { cookie: c.cookie });
  const bookings = async (c: Account) => (await get(c, "/bookings")).json().bookings as { id: string; code: string; shop: { slug: string }; status: string; canCheckIn: { allowed: boolean; reason?: string; opensAt?: string }; canCancel: { allowed: boolean; reason?: string }; canRate: boolean; rating: { stars: number } | null; totalAmount: number; currency: string; session: { startsAt: string } }[];
  const profileBody = (over: Record<string, unknown> = {}) => ({ fullName: "  Emma Wilson ", phone: " +44 20 7946 0000 ", preferredLocale: "en", country: "gb", birthDate: "1990-04-12", favoriteCategories: ["BAKING", "COFFEE_TEA", "DRINKS"], gender: "FEMALE", socials: { INSTAGRAM: " emma.w ", TIKTOK: "   " }, avatarUrl: "https://example.test/a.png", ...over });

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("custroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    a = await makeShop("custa");
    b = await makeShop("custb");
    c1 = await makeAccount("emma");
    c2 = await makeAccount("noah");
  });
  afterAll(async () => {
    // the shops of the test are not left on the Workshops page of the customers
    for (const s of [a, b]) await t.post(`/admin/organizations/${s.orgId}/visibility`, { showOnCustomerPage: false }, { cookie: admin });
    await t.close();
  });

  it("shows and replaces the profile of the account in the session: trimmed, validated, the email never changes, nobody else's", async () => {
    const empty = (await get(c1, "")).json();
    expect(empty).toMatchObject({ id: c1.id, email: c1.email, preferredLocale: "en", account: { country: "", birthDate: "", favoriteCategories: [] } });
    expect((await t.get(`/customer/${c1.id}`)).statusCode).toBe(401);
    expect((await get(c1, "")).json().id).toBe(c1.id);
    expect((await t.get(`/customer/${c2.id}`, { cookie: c1.cookie })).statusCode).toBe(404); // another account's id: the same 404
    expect((await send("PATCH", { ...c1, id: c2.id }, "", profileBody())).statusCode).toBe(404);

    const fields = async (over: Record<string, unknown>) => (await send("PATCH", c1, "", profileBody(over))).json().error?.details?.fields;
    expect(await fields({ fullName: "   " })).toEqual({ fullName: "required" });
    expect(await fields({ fullName: "N".repeat(121) })).toEqual({ fullName: "tooLong" });
    expect(await fields({ country: "Britain" })).toEqual({ country: "invalid" });
    expect(await fields({ birthDate: "1990-02-30" })).toEqual({ birthDate: "invalid" });
    expect(await fields({ birthDate: "2999-01-01" })).toEqual({ birthDate: "future" });
    expect(await fields({ favoriteCategories: ["BAKING", "COFFEE_TEA"] })).toEqual({ favoriteCategories: "count" });
    expect(await fields({ favoriteCategories: ["BAKING", "BAKING", "DRINKS"] })).toEqual({ favoriteCategories: "count" });
    expect(await fields({ favoriteCategories: ["BAKING", "COFFEE_TEA", "NOPE"] })).toMatchObject({ "favoriteCategories.2": "invalid" });
    expect(await fields({ preferredLocale: "xx" })).toEqual({ preferredLocale: "invalid" });
    expect(await fields({ avatarUrl: "http://example.test/a.png" })).toEqual({ avatarUrl: "invalid" });
    expect(await fields({ gender: "ROBOT" })).toEqual({ gender: "invalid" });
    expect(await fields({ socials: { INSTAGRAM: "x".repeat(101) } })).toMatchObject({ "socials.INSTAGRAM": "tooLong" });
    expect((await get(c1, "")).json().account.country).toBe(""); // nothing was saved by the refused calls

    const saved = await send("PATCH", c1, "", profileBody());
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ id: c1.id, fullName: "Emma Wilson", email: c1.email, phone: "+44 20 7946 0000", preferredLocale: "en", account: { country: "GB", birthDate: "1990-04-12", favoriteCategories: ["BAKING", "COFFEE_TEA", "DRINKS"], gender: "FEMALE", socials: { INSTAGRAM: "emma.w" }, avatarUrl: "https://example.test/a.png" } });
    // written whole: what is left out is removed
    const second = await send("PATCH", c1, "", { fullName: "Emma W", preferredLocale: "vi", country: "GB", birthDate: "1990-04-12", favoriteCategories: ["BAKING", "COFFEE_TEA", "DRINKS"] });
    expect(second.json()).toEqual({ id: c1.id, fullName: "Emma W", email: c1.email, preferredLocale: "vi", account: { country: "GB", birthDate: "1990-04-12", favoriteCategories: ["BAKING", "COFFEE_TEA", "DRINKS"] } });
    const log = await t.pool.query("select before::text as b, after::text as a from audit_logs where entity_id = $1 and action = 'customer.profile_update'", [c1.id]);
    expect(log.rowCount).toBe(2);
    for (const l of log.rows) expect(`${l.b}${l.a}`).not.toMatch(/Emma|1990|emma\.w|GB/); // personal data stays out of the audit log
  });

  it("lists the bookings made with the email of the account, in every shop, and nobody else's, with what each button can do and why", async () => {
    ids.far = await session(a, a.w1, 5 * 24 * 60); // in five days
    ids.soon = await session(a, a.w1, 30); // in half an hour: the check-in is open
    ids.bSession = await session(b, b.w1, 3 * 24 * 60);
    ids.bFar = await manual(a, ids.far, c1.email);
    ids.bSoon = await manual(a, ids.soon, ` ${c1.email.toUpperCase()}`.trim());
    ids.bShopB = await manual(b, ids.bSession, c1.email);
    ids.bOther = await manual(a, ids.far, c2.email);
    ids.bNotConfirmed = await manual(a, ids.far, c1.email);
    await t.pool.query("update bookings set status = 'NOT_CONFIRMED' where id = $1", [ids.bNotConfirmed]);
    ids.bCancelled = await manual(a, ids.far, c1.email);
    expect((await t.post(`/bookings/${ids.bCancelled}/cancel`, { reason: "Changed plans" }, { cookie: a.cookie })).statusCode).toBe(200);

    const mine = await bookings(c1);
    expect(mine.map((x) => x.id).sort()).toEqual([ids.bFar, ids.bSoon, ids.bShopB, ids.bNotConfirmed, ids.bCancelled].sort());
    expect(mine.map((x) => x.id)).not.toContain(ids.bOther); // another account's booking is not here
    expect((await bookings(c2)).map((x) => x.id)).toEqual([ids.bOther]);
    expect(mine.find((x) => x.id === ids.bShopB)).toMatchObject({ shop: { slug: b.slug } }); // the bookings of every shop
    expect(mine.map((x) => x.session.startsAt)).toEqual([...mine.map((x) => x.session.startsAt)].sort()); // soonest first
    const body = (await get(c1, "/bookings")).json();
    expect(typeof body.now).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/payments?\b.*recorded|organization_id|organizationId/); // nothing of the inside of the shop

    const by = (id: string) => mine.find((x) => x.id === id)!;
    expect(by(ids.bSoon)).toMatchObject({ status: "CONFIRMED", canCheckIn: { allowed: true }, canCancel: { allowed: true }, canRate: false, rating: null });
    expect(by(ids.bFar).canCheckIn).toMatchObject({ allowed: false, reason: "TOO_EARLY" });
    expect(new Date(by(ids.bFar).canCheckIn.opensAt!).getTime()).toBe(new Date(by(ids.bFar).session.startsAt).getTime() - 60 * 60_000);
    expect(by(ids.bNotConfirmed).canCheckIn).toMatchObject({ allowed: false, reason: "NOT_CONFIRMED" });
    expect(by(ids.bCancelled)).toMatchObject({ status: "CANCELLED", canCheckIn: { allowed: false, reason: "CANCELLED" }, canCancel: { allowed: false, reason: "CANCELLED" } });
    expect(by(ids.bFar).canCancel).toEqual({ allowed: true });
  });

  it("checks the customer in from an hour before the start, once, and refuses it with the reason otherwise", async () => {
    const early = await post(c1, `/bookings/${ids.bFar}/check-in`);
    expect([early.statusCode, early.json().error.code, early.json().error.details.reason]).toEqual([409, "NOT_CHECKABLE", "TOO_EARLY"]);
    expect((await post(c1, `/bookings/${ids.bNotConfirmed}/check-in`)).json().error.details.reason).toBe("NOT_CONFIRMED");
    expect((await post(c1, `/bookings/${ids.bCancelled}/check-in`)).json().error.details.reason).toBe("CANCELLED");
    expect((await post(c2, `/bookings/${ids.bSoon}/check-in`)).statusCode).toBe(404); // another account's booking: the same 404 as an unknown one
    expect((await t.post(`/customer/${c2.id}/bookings/${ids.bSoon}/check-in`, {}, { cookie: c1.cookie })).statusCode).toBe(404); // and another id in the path
    expect((await post(c1, `/bookings/${randomUUID()}/check-in`)).statusCode).toBe(404);
    expect((await post(c1, `/bookings/not-an-id/check-in`)).statusCode).toBe(404); // an id that is not even an id is the same 404

    const done = await post(c1, `/bookings/${ids.bSoon}/check-in`);
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ id: ids.bSoon, status: "CHECKED_IN", canCheckIn: { allowed: false, reason: "ALREADY_CHECKED_IN" }, canCancel: { allowed: false, reason: "CHECKED_IN" } });
    expect(done.json().checkedInAt).not.toBeNull();
    expect((await t.pool.query("select status_before_check_in from bookings where id = $1", [ids.bSoon])).rows[0]).toEqual({ status_before_check_in: "CONFIRMED" }); // the shop can still uncheck it
    expect((await post(c1, `/bookings/${ids.bSoon}/check-in`)).json().error.details.reason).toBe("ALREADY_CHECKED_IN");
    expect((await t.pool.query("select actor_user_id from audit_logs where entity_id = $1 and action = 'booking.check_in'", [ids.bSoon])).rows).toEqual([{ actor_user_id: c1.id }]);
  });

  it("lets the customer rate a workshop once, after the check-in and when its session is over, and counts only the ratings that were not removed", async () => {
    ids.ended = await session(a, a.w1, -180, "COMPLETED");
    ids.bRate = await inject(a, a.w1, ids.ended, c1.email, "CHECKED_IN");
    ids.bNotCheckedIn = await inject(a, a.w1, ids.ended, c1.email, "CONFIRMED");
    expect((await bookings(c1)).find((x) => x.id === ids.bRate)).toMatchObject({ canRate: true, rating: null });
    expect((await bookings(c1)).find((x) => x.id === ids.bNotCheckedIn)).toMatchObject({ canRate: false });

    const rate = (id: string, body: unknown, c = c1) => post(c, `/bookings/${id}/rating`, body);
    expect((await rate(ids.bSoon, { stars: 5 })).json().error.code).toBe("NOT_ENDED"); // checked in, but the session has not ended
    expect((await rate(ids.bNotCheckedIn, { stars: 5 })).json().error.code).toBe("NOT_CHECKED_IN");
    expect((await rate(ids.bRate, { stars: 0 })).json().error.details.fields).toEqual({ stars: "starsInvalid" });
    expect((await rate(ids.bRate, { stars: 6 })).json().error.details.fields).toEqual({ stars: "starsInvalid" });
    expect((await rate(ids.bRate, { stars: 4.5 })).json().error.details.fields).toEqual({ stars: "starsInvalid" });
    expect((await rate(ids.bRate, {})).statusCode).toBe(422);
    expect((await rate(ids.bRate, { stars: 5, comment: "x".repeat(501) })).json().error.details.fields).toEqual({ comment: "tooLong" });
    expect((await rate(ids.bRate, { stars: 5 }, c2)).statusCode).toBe(404); // not the booking of this account

    const ok = await rate(ids.bRate, { stars: 4, comment: "  Lovely class <b>chef</b>  " });
    expect(ok.statusCode).toBe(201);
    expect(ok.json()).toMatchObject({ stars: 4, comment: "Lovely class <b>chef</b>" }); // kept as text: the screens show it as text
    ids.rating = ok.json().id;
    expect((await rate(ids.bRate, { stars: 5 })).json().error.code).toBe("ALREADY_RATED");
    expect((await bookings(c1)).find((x) => x.id === ids.bRate)).toMatchObject({ canRate: false, rating: { stars: 4 } });
    const log = await t.pool.query("select after::text as a from audit_logs where entity_id = $1 and action = 'booking.rate'", [ids.bRate]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]!.a).toContain('"stars": 4');
    expect(log.rows[0]!.a).not.toMatch(/Lovely|chef/); // the comment is not in the audit log
    expect((await t.pool.query("select count(*)::int as n from workshop_ratings where booking_id = $1", [ids.bRate])).rows[0]).toEqual({ n: 1 });

    // what the shop sees: read only, its own workshops only
    const shopA = (await t.get("/ratings", { cookie: a.cookie })).json();
    expect(shopA).toMatchObject({ average: 4, count: 1 });
    expect(shopA.items[0]).toMatchObject({ stars: 4, comment: "Lovely class <b>chef</b>", workshopId: a.w1 });
    expect((await t.get("/ratings", { cookie: b.cookie })).json()).toEqual({ items: [], average: null, count: 0 });
    expect((await t.get("/ratings")).statusCode).toBe(401);
    // and the score of the workshop on its landing page
    const site = (await t.get(`/public/sites/${a.slug}`)).json();
    expect(site.workshops.find((w: { id: string }) => w.id === a.w1).rating).toEqual({ average: 4, count: 1 });
    expect(site.workshops.find((w: { id: string }) => w.id === a.w2).rating).toEqual({ average: null, count: 0 });
  });

  it("lets the platform administrator remove a rating with a reason (it stops counting, the shop no longer sees it, nobody can rate that booking again) and put it back", async () => {
    const list = (await t.get(`/admin/directory/ratings?q=${encodeURIComponent(c1.email)}`, { cookie: admin })).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: ids.rating, stars: 4, status: "SHOWN", shopSlug: a.slug, customer: { email: c1.email } });
    expect((await t.get("/admin/directory/ratings", { cookie: a.cookie })).statusCode).toBe(403);
    expect((await t.get(`/admin/directory/ratings?q=${encodeURIComponent(c1.email)}&status=REMOVED`, { cookie: admin })).json().items).toEqual([]);
    expect((await t.get(`/admin/directory/ratings?q=${encodeURIComponent(c1.email)}&stars=5`, { cookie: admin })).json().items).toEqual([]);

    const remove = (removed: boolean, reason?: string, cookie = admin) => t.post(`/admin/ratings/${ids.rating}`, { removed, ...(reason !== undefined ? { reason } : {}) }, { cookie });
    expect((await remove(true, "x", a.cookie)).statusCode).toBe(403);
    expect((await remove(true)).json().error.details.fields).toEqual({ reason: "required" });
    expect((await t.post(`/admin/ratings/${randomUUID()}`, { removed: true, reason: "x" }, { cookie: admin })).statusCode).toBe(404);
    expect((await remove(false)).json().error.code).toBe("NOT_REMOVED");
    expect((await remove(true, "  Offensive  ")).json()).toEqual({ id: ids.rating, status: "REMOVED", removedReason: "Offensive" });
    expect((await remove(true, "again")).json().error.code).toBe("ALREADY_REMOVED");

    expect((await t.get("/ratings", { cookie: a.cookie })).json()).toEqual({ items: [], average: null, count: 0 }); // the shop no longer sees it
    expect((await t.get(`/public/sites/${a.slug}`)).json().workshops.find((w: { id: string }) => w.id === a.w1).rating).toEqual({ average: null, count: 0 }); // and it stops counting
    expect((await post(c1, `/bookings/${ids.bRate}/rating`, { stars: 5 })).json().error.code).toBe("ALREADY_RATED"); // the customer cannot rate that booking again
    expect((await bookings(c1)).find((x) => x.id === ids.bRate)).toMatchObject({ canRate: false, rating: null });
    expect((await remove(false)).json()).toEqual({ id: ids.rating, status: "SHOWN", removedReason: null });
    expect((await t.get("/ratings", { cookie: a.cookie })).json()).toMatchObject({ average: 4, count: 1 });
    const log = await t.pool.query<{ action: string; after: string }>("select action, after::text as after from audit_logs where entity_id = $1 and action like 'rating.%' order by created_at", [ids.rating]);
    expect(log.rows.map((r) => r.action)).toEqual(["rating.remove", "rating.restore"]);
    expect(log.rows.map((r) => r.after).join()).not.toMatch(/Lovely|chef/); // the comment is not in the audit log
  });

  it("lists on the Workshops page only the active workshops of the active shops the platform chose, in the order for this customer, with search and favorites", async () => {
    await send("PATCH", c1, "", profileBody({ favoriteCategories: ["BAKING", "COFFEE_TEA", "DRINKS"] }));
    expect((await t.post(`/admin/organizations/${a.orgId}/visibility`, { showOnCustomerPage: true }, { cookie: a.cookie })).statusCode).toBe(403); // only the platform chooses
    expect((await t.post(`/admin/organizations/${randomUUID()}/visibility`, { showOnCustomerPage: true }, { cookie: admin })).statusCode).toBe(404);
    expect((await t.post(`/admin/organizations/${a.orgId}/visibility`, { showOnCustomerPage: true }, { cookie: admin })).json()).toEqual({ id: a.orgId, showOnCustomerPage: true });
    const draft = await t.post("/workshops", { title: { en: `Draft ${unique("w")}` }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 10, maxPerBooking: 4, categories: ["ART"] }, { cookie: a.cookie });

    const search = async (q: string, c = c1) => (await get(c, `/workshops?q=${encodeURIComponent(q)}`)).json();
    const shopOnly = await search(a.name);
    expect(shopOnly.total).toBe(2);
    expect(shopOnly.items.map((w: { id: string }) => w.id)).not.toContain(draft.json().id); // a draft is not listed
    expect(shopOnly.items[0]).toMatchObject({ shop: { name: a.name, slug: a.slug }, rating: expect.any(Object), favorite: false, currency: "VND" });
    expect((await search(b.name)).items).toEqual([]); // a shop the platform did not choose
    // what the customer likes comes first: BAKING (W2) before COOKING (W1), among all the shops that are listed
    const all = (await get(c1, "/workshops")).json().items.map((w: { id: string }) => w.id);
    expect(all.indexOf(a.w2)).toBeGreaterThanOrEqual(0);
    expect(all.indexOf(a.w2)).toBeLessThan(all.indexOf(a.w1));
    expect((await search(a.name.toUpperCase())).total).toBe(2); // case does not matter
    expect((await search("zzzz-nothing-like-this")).total).toBe(0);

    // favorites
    expect((await send("PUT", c1, `/favorites/${a.w1}`)).statusCode).toBe(204);
    expect((await send("PUT", c1, `/favorites/${a.w1}`)).statusCode).toBe(204); // twice is the same as once
    expect((await send("PUT", c1, `/favorites/${randomUUID()}`)).statusCode).toBe(404);
    expect((await send("PUT", c1, `/favorites/${draft.json().id}`)).statusCode).toBe(404); // a draft cannot be saved
    expect((await send("PUT", { ...c2, id: c1.id }, `/favorites/${a.w2}`)).statusCode).toBe(404); // the account of the session is c2, not c1
    expect((await search(a.name)).items.find((w: { id: string }) => w.id === a.w1).favorite).toBe(true);
    expect((await search(a.name, c2)).items.find((w: { id: string }) => w.id === a.w1).favorite).toBe(false); // the hearts are the customer's own
    const favs = (await get(c1, "/favorites")).json();
    expect(favs.items.map((w: { id: string }) => w.id)).toEqual([a.w1]);
    expect((await send("DELETE", c1, `/favorites/${a.w1}`)).statusCode).toBe(204);
    expect((await send("DELETE", c1, `/favorites/${a.w1}`)).statusCode).toBe(204);
    expect((await get(c1, "/favorites")).json()).toEqual({ items: [], total: 0 });
    // a shop that is no longer chosen disappears from the page
    await t.post(`/admin/organizations/${a.orgId}/visibility`, { showOnCustomerPage: false }, { cookie: admin });
    expect((await search(a.name)).items).toEqual([]);
    expect((await t.pool.query("select count(*)::int as n from audit_logs where organization_id = $1 and action = 'organization.visibility'", [a.orgId])).rows[0]!.n).toBeGreaterThanOrEqual(2);
  });
});
