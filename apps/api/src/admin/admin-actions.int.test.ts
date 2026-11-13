import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, drain, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The guests told when a session is closed or moved, and what the platform administrator does on behalf of a shop (D14, D15): a reason is required, the owner is told, the limits of the owner do not bind
// the administrator, and the same rules and the same audit lines apply.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string; name: string; ownerEmail: string; w1: string; w2: string }
let counter = 0;
let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.9`;
const DAY = 86_400_000;

d("sessions, guests and the administrator acting for a shop", () => {
  let t: TestApp;
  let admin: string;
  let a: Shop;

  async function makeShop(label: string): Promise<Shop> {
    const ownerEmail = emailFor(label);
    const name = `Shop ${unique(label)}`;
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", ownerEmail, name), { from: nextIp() });
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    await t.pool.query("update organizations set status = 'ACTIVE', contact_phone = '+84 90 000 0000' where id = $1", [orgId]);
    const make = async () => {
      const w = await t.post("/workshops", { title: { en: `W ${unique("w")}` }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 20, maxPerBooking: 4, categories: ["COOKING"] }, { cookie });
      await t.post(`/workshops/${w.json().id}/status`, { status: "ACTIVE" }, { cookie });
      return w.json().id as string;
    };
    return { cookie, orgId, slug, name, ownerEmail, w1: await make(), w2: await make() };
  }
  async function session(shop: Shop, days: number, status: string, over: { notes?: unknown[]; autoClosed?: boolean; workshopId?: string } = {}): Promise<string> {
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [shop.orgId])).rows[0]!.n;
    return (await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code, session_notes, auto_closed)
       select $1, $2, s, s, s + interval '1 hour', 20, $3, $4, $5::jsonb, $6 from (select now() + $7::numeric * interval '1 day' as s) x returning id`,
      [shop.orgId, over.workshopId ?? shop.w1, status, `SES-${String(seq).padStart(4, "0")}`, JSON.stringify(over.notes ?? []), over.autoClosed ?? false, days],
    )).rows[0]!.id;
  }
  /** A booking for a guest, written into the table (the session may be in any state). */
  async function booking(shop: Shop, sessionId: string, email: string | null, status = "CONFIRMED"): Promise<string> {
    const c = (await t.pool.query<{ id: string }>("insert into customers (organization_id, full_name) values ($1, 'Guest') returning id", [shop.orgId])).rows[0]!.id;
    const code = `SES-9${String(counter++).padStart(3, "0")}-001`;
    return (await t.pool.query<{ id: string }>(
      `insert into bookings (organization_id, booking_code, session_id, workshop_id, customer_id, source, quantity, status, unit_price_amount, total_amount, currency, guest_name, guest_email, snapshot)
       select $1, $2, $3, workshop_id, $4, 'ONLINE', 2, $5, 100000, 200000, 'VND', 'Guest Name', $6, $7::jsonb from workshop_sessions where id = $3 returning id`,
      [shop.orgId, code, sessionId, c, status, email, JSON.stringify({ workshopTitle: { en: "x" }, sessionCode: "SES-0001", startsAt: new Date().toISOString(), endsAt: new Date().toISOString(), timezone: "Asia/Ho_Chi_Minh", address: "1 Test Street" })],
    )).rows[0]!.id;
  }
  const status = async (id: string) => (await t.pool.query<{ status: string }>("select status from workshop_sessions where id = $1", [id])).rows[0]!.status;
  const owner = (path: string, body: unknown = {}) => t.post(path, body, { cookie: a.cookie });
  const adminPost = (path: string, body: unknown, cookie = admin) => t.post(`/admin/shops/${a.orgId}${path}`, body, { cookie });
  const mailTo = (to: string, subject: RegExp) => t.emails.sent.filter((m) => m.to === to && subject.test(m.subject));

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("actroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    a = await makeShop("acta");
  });
  afterAll(async () => { await t.close(); });

  it("tells every guest with a live booking when the owner closes a session, and nobody else", async () => {
    const s = await session(a, 3, "PAUSED");
    const e = { one: emailFor("g1"), two: emailFor("g2"), cancelled: emailFor("g3") };
    const b1 = await booking(a, s, e.one);
    await booking(a, s, e.two, "NOT_CONFIRMED");
    await booking(a, s, e.cancelled, "CANCELLED");
    await booking(a, s, null); // a guest at the studio with no email
    const res = await owner(`/sessions/${s}/close`, { reason: { code: "VENUE_ISSUE" } });
    expect(res.statusCode).toBe(200);
    await drain(t);
    for (const to of [e.one, e.two]) {
      const [m] = mailTo(to, /was closed/);
      expect(m, to).toBeDefined();
      expect(m!.text).toContain("will not take place");
      expect(m!.text).toContain("there is a problem with the venue"); // the reason in words, never the code
      expect(m!.text).not.toContain("VENUE_ISSUE");
      expect(m!.text).toContain("SES-9"); // the code of the booking
      expect(m!.subject).toContain(a.name);
    }
    expect(mailTo(e.cancelled, /./)).toEqual([]); // a cancelled booking is not told
    expect((await t.pool.query("select count(*)::int as n from outbox_events where template = 'session-notice' and organization_id = $1", [a.orgId])).rows[0]!.n).toBe(2); // none for the guest without an email
    expect(b1).toBeTruthy();
  });

  it("tells the guests when the owner moves a session, with the new time and the old one, and tells nobody when the move is refused", async () => {
    const s = await session(a, 4, "OPEN");
    const guest = emailFor("mover");
    await booking(a, s, guest);
    const before = (await t.pool.query<{ starts_at: Date }>("select starts_at from workshop_sessions where id = $1", [s])).rows[0]!.starts_at;
    const refused = await owner(`/sessions/${s}/reschedule`, { newStartsAt: new Date(Date.now() - DAY).toISOString(), reason: { code: "SCHEDULE_CHANGE" } });
    expect(refused.statusCode).toBe(422); // the past
    await drain(t);
    expect(mailTo(guest, /./)).toEqual([]);
    const next = new Date(before.getTime() + 2 * DAY).toISOString();
    expect((await owner(`/sessions/${s}/reschedule`, { newStartsAt: next, reason: { code: "INSTRUCTOR_UNAVAILABLE" } })).statusCode).toBe(200);
    await drain(t);
    const [m] = mailTo(guest, /was moved/);
    expect(m).toBeDefined();
    expect(m!.text).toContain("Your booking stays valid");
    expect(m!.text).toContain("the instructor is not available");
    expect(m!.text).toMatch(/Before: /);
    expect(m!.text).toContain("Guests: 2");
  });

  it("needs a reason for everything the administrator does for a shop, and changes nothing without one", async () => {
    const s = await session(a, 6, "PAUSED");
    const w = a.w2;
    const calls: [string, unknown][] = [
      [`/workshops/${w}/status`, { status: "DRAFT" }], [`/sessions/${s}/close`, {}], [`/sessions/${s}/reopen`, {}], [`/sessions/${s}/reschedule`, { newStartsAt: new Date(Date.now() + 9 * DAY).toISOString() }],
      [`/site/pages/${randomUUID()}/publish`, {}],
    ];
    for (const [path, body] of calls) {
      for (const reason of [undefined, "", "   "]) {
        const res = await adminPost(path, { ...(body as object), ...(reason !== undefined ? { reason } : {}) });
        expect([res.statusCode, res.json().error.code, res.json().error.details.fields], path).toEqual([422, "ADMIN_REASON_REQUIRED", { reason: "required" }]);
      }
      expect((await adminPost(path, { ...(body as object), reason: "r".repeat(301) })).json().error.details.fields, path).toEqual({ reason: "tooLong" });
    }
    expect(await status(s)).toBe("PAUSED"); // nothing changed
    expect((await t.pool.query("select status from workshops where id = $1", [w])).rows[0]).toEqual({ status: "ACTIVE" });
    expect((await t.pool.query("select 1 from audit_logs where organization_id = $1 and action = 'admin_edit.reason'", [a.orgId])).rowCount).toBe(0);
    expect((await adminPost(`/sessions/${s}/close`, { reason: "x" }, a.cookie)).statusCode).toBe(403); // the owner has no way in here
    expect((await t.post(`/admin/shops/${randomUUID()}/sessions/${s}/close`, { reason: "x" }, { cookie: admin })).statusCode).toBe(404);
    expect((await t.post(`/admin/shops/${a.orgId}/sessions/${randomUUID()}/close`, { reason: "x" }, { cookie: admin })).statusCode).toBe(404);
  });

  it("activates and deactivates a workshop for a shop: the same rules, an audit line with the reason, and an email to the owner", async () => {
    const res = await adminPost(`/workshops/${a.w2}/status`, { status: "DRAFT", reason: "  Misleading description  " });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: a.w2, status: "DRAFT" });
    await drain(t);
    const [m] = mailTo(a.ownerEmail, /The platform changed your shop/);
    expect(m).toBeDefined();
    expect(m!.text).toContain("deactivated");
    expect(m!.text).toContain("Misleading description");
    const log = await t.pool.query<{ action: string; actor_user_id: string | null; after: { reason?: string } }>("select action, actor_user_id, after from audit_logs where entity_id = $1 and action in ('workshop.deactivate', 'admin_edit.reason') order by created_at", [a.w2]);
    expect(log.rows.map((r) => r.action)).toEqual(["workshop.deactivate", "admin_edit.reason"]);
    expect(log.rows.every((r) => r.actor_user_id !== null)).toBe(true); // done by the administrator
    expect(log.rows[1]!.after).toMatchObject({ action: "workshop.deactivate", reason: "Misleading description" });
    expect((await adminPost(`/workshops/${a.w2}/status`, { status: "DRAFT", reason: "again" })).json().error.code).toBe("STATUS"); // the rules of the owner apply
    expect((await adminPost(`/workshops/${a.w2}/status`, { status: "ACTIVE", reason: "Fixed" })).json()).toMatchObject({ status: "ACTIVE" });
  });

  it("closes a session for a shop whatever its state or its closes, tells the guests and the owner, and refuses one that is over", async () => {
    const s = await session(a, 5, "RUNNING"); // the owner cannot close a running session; the administrator can
    const guest = emailFor("adminclose");
    await booking(a, s, guest);
    expect((await owner(`/sessions/${s}/close`, { reason: { code: "VENUE_ISSUE" } })).json().error.code).toBe("INVALID_STATE");
    const done = await adminPost(`/sessions/${s}/close`, { reason: "Safety inspection of the studio" });
    expect([done.statusCode, done.json().status]).toEqual([200, "CLOSED"]);
    await drain(t);
    const [g] = mailTo(guest, /was closed/);
    expect(g!.text).toContain("Safety inspection of the studio");
    expect(mailTo(a.ownerEmail, /The platform changed your shop/).some((m) => m.text.includes("Safety inspection"))).toBe(true);
    expect((await t.pool.query<{ action: string }>("select action from audit_logs where entity_id = $1 and action in ('session.close', 'admin_edit.reason') order by created_at", [s])).rows.map((r) => r.action)).toEqual(["session.close", "admin_edit.reason"]);
    expect((await adminPost(`/sessions/${s}/close`, { reason: "again" })).json().error.code).toBe("INVALID_STATE"); // already closed
    const completed = await session(a, -1, "COMPLETED");
    expect((await adminPost(`/sessions/${completed}/close`, { reason: "x" })).json().error.code).toBe("INVALID_STATE"); // a completed session is final for everybody
  });

  it("re-opens a session for a shop even when the owner closed it for good, but not one the system closed, one that is running or one that is completed", async () => {
    const notes = Array.from({ length: 4 }, () => ({ type: "CLOSED", at: new Date().toISOString(), reason: { code: "OTHER", note: "x" } }));
    const forGood = await session(a, 5, "CLOSED", { notes });
    expect((await owner(`/sessions/${forGood}/reopen`)).json().error.code).toBe("NOT_REOPENABLE"); // the limit of the owner
    const done = await adminPost(`/sessions/${forGood}/reopen`, { reason: "Closed by mistake, the shop asked us" });
    expect([done.statusCode, done.json().status]).toEqual([200, "OPEN"]);
    expect(await status(forGood)).toBe("OPEN");
    expect((await adminPost(`/sessions/${forGood}/reopen`, { reason: "again" })).json().error.code).toBe("NOT_REOPENABLE"); // it is not closed any more
    const bySystem = await session(a, 5, "CLOSED", { autoClosed: true });
    expect((await adminPost(`/sessions/${bySystem}/reopen`, { reason: "x" })).json().error.code).toBe("NOT_REOPENABLE");
    const running = await session(a, 5, "RUNNING");
    expect((await adminPost(`/sessions/${running}/reopen`, { reason: "x" })).json().error.code).toBe("NOT_REOPENABLE");
    const over = await session(a, -2, "CLOSED");
    expect((await adminPost(`/sessions/${over}/reopen`, { reason: "x" })).json().error.code).toBe("NOT_REOPENABLE"); // a session that has started
    await drain(t);
    expect(mailTo(a.ownerEmail, /The platform changed your shop/).some((m) => m.text.includes("opened again") && m.text.includes("Closed by mistake"))).toBe(true);
  });

  it("moves a session for a shop beyond the 3 moves of the owner, and tells the guests", async () => {
    const notes = Array.from({ length: 3 }, () => ({ type: "RESCHEDULED", at: new Date().toISOString(), reason: { code: "OTHER", note: "x" }, from: new Date().toISOString() }));
    const s = await session(a, 5, "PAUSED", { notes });
    const guest = emailFor("adminmove");
    await booking(a, s, guest);
    const next = new Date(Date.now() + 9 * DAY).toISOString();
    expect((await owner(`/sessions/${s}/reschedule`, { newStartsAt: next, reason: { code: "SCHEDULE_CHANGE" } })).json().error.code).toBe("RESCHEDULE_LIMIT");
    const done = await adminPost(`/sessions/${s}/reschedule`, { newStartsAt: next, reason: "The venue is closed that day" });
    expect(done.statusCode).toBe(200);
    expect(new Date(done.json().startsAt).toISOString()).toBe(next);
    await drain(t);
    expect(mailTo(guest, /was moved/)[0]!.text).toContain("The venue is closed that day");
    expect((await adminPost(`/sessions/${s}/reschedule`, { newStartsAt: "tomorrow", reason: "x" })).json().error.details.fields).toEqual({ newStartsAt: "invalid" });
    const running = await session(a, 5, "RUNNING");
    expect((await adminPost(`/sessions/${running}/reschedule`, { newStartsAt: next, reason: "x" })).json().error.code).toBe("NOT_RESCHEDULABLE"); // the rules of the status stay
  });

  it("publishes a landing page for an active shop only, and leaves a shop in draft to its owner", async () => {
    const page = { schemaVersion: 1, sections: [{ id: unique("s"), type: "hero", enabled: true, props: { title: { en: "Welcome" } } }, { id: unique("s"), type: "footer", enabled: true, props: { text: { en: "Bye" } } }], seo: { title: { en: "Shop" }, description: { en: "A shop" } } };
    const put = (url: string, payload: unknown, cookie: string) => t.app.inject({ method: "PUT", url: `/api/v1${url}`, payload: payload as object, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie } });
    const fresh = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("draftshop"), `Draft ${unique("d")}`), { from: nextIp() });
    const draftOrg = fresh.json().organization.id as string;
    const draftPage = (await t.post("/site/pages", { name: "Home" }, { cookie: cookieOf(fresh) })).json();
    expect((await t.post(`/admin/shops/${draftOrg}/site/pages/${draftPage.id}/publish`, { reason: "x" }, { cookie: admin })).json().error.code).toBe("SHOP_NOT_ACTIVE"); // the owner activates a shop

    // an active shop: the owner published once, saved a newer draft; the administrator publishes it for them
    const p = (await t.post("/site/pages", { name: "Home" }, { cookie: a.cookie })).json();
    await put(`/site/pages/${p.id}/draft`, { content: page }, a.cookie);
    expect((await t.post(`/site/pages/${p.id}/publish`, {}, { cookie: a.cookie })).json()).toMatchObject({ version: 1 });
    await put(`/site/pages/${p.id}/draft`, { content: { ...page, seo: { title: { en: "New title" }, description: { en: "A shop" } } } }, a.cookie);
    const done = await adminPost(`/site/pages/${p.id}/publish`, { reason: "Wrong opening hours on the live page" });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ isLive: true, version: 2 });
    await drain(t);
    expect(mailTo(a.ownerEmail, /The platform changed your shop/).some((m) => m.text.includes("landing page") && m.text.includes("Wrong opening hours"))).toBe(true);
    expect((await t.pool.query("select 1 from audit_logs where entity_id = $1 and action = 'admin_edit.reason'", [p.id])).rowCount).toBe(1);

    // a suspended shop is read only for everybody
    await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [a.orgId]);
    const res = await adminPost(`/sessions/${randomUUID()}/close`, { reason: "x" });
    expect([res.statusCode, res.json().error.code]).toEqual([403, "SHOP_SUSPENDED"]);
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [a.orgId]);
  });
});
