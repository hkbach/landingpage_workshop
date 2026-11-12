import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MaintenanceService } from "./maintenance";
import { TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

const d = describe.skipIf(!TEST_DATABASE_URL);

// The jobs of the worker, called directly: what pg-boss runs on a schedule is these two methods.
d("the maintenance jobs of the worker", () => {
  let t: TestApp;
  let jobs: MaintenanceService;
  let shop: { cookie: string; orgId: string };

  beforeAll(async () => {
    t = await startApp();
    jobs = t.app.get(MaintenanceService, { strict: false });
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("maint"), `Shop ${unique("m")}`));
    shop = { cookie: cookieOf(res), orgId: res.json().organization.id };
  });
  afterAll(async () => { await t.close(); });

  const workshop = async (): Promise<string> => {
    const res = await t.post("/workshops", { title: { en: `Maint ${unique("w")}` }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 5, maxPerBooking: 4, categories: ["COOKING"] }, { cookie: shop.cookie });
    if (res.statusCode !== 201) throw new Error(`The test workshop was not created (${res.statusCode}): ${res.body}`);
    return res.json().id as string;
  };

  it("sweepSessions closes every session whose time is over, once, and leaves the others alone", async () => {
    const w = await workshop();
    const q = "insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code) values ($1, $2, now() + $3::interval, now() + $3::interval, now() + $3::interval + interval '1 hour', 5, $4, $5) returning id";
    const over = (await t.pool.query<{ id: string }>(q, [shop.orgId, w, "-3 hours", "RUNNING", "SES-7771"])).rows[0]!.id;
    const paused = (await t.pool.query<{ id: string }>(q, [shop.orgId, w, "-5 hours", "PAUSED", "SES-7772"])).rows[0]!.id;
    const future = (await t.pool.query<{ id: string }>(q, [shop.orgId, w, "2 days", "OPEN", "SES-7773"])).rows[0]!.id;
    const done = (await t.pool.query<{ id: string }>(q, [shop.orgId, w, "-9 hours", "COMPLETED", "SES-7774"])).rows[0]!.id;

    expect(await jobs.sweepSessions()).toBeGreaterThanOrEqual(2);
    expect(await jobs.sweepSessions()).toBe(0); // nothing left to close: a second run changes nothing
    const rows = await t.pool.query<{ id: string; status: string; auto_closed: boolean; session_notes: unknown[] }>("select id, status, auto_closed, session_notes from workshop_sessions where id = any($1)", [[over, paused, future, done]]);
    const by = Object.fromEntries(rows.rows.map((r) => [r.id, r]));
    expect(by[over]).toMatchObject({ status: "CLOSED", auto_closed: true });
    expect(by[paused]).toMatchObject({ status: "CLOSED", auto_closed: true });
    expect(by[future]).toMatchObject({ status: "OPEN", auto_closed: false });
    expect(by[done]).toMatchObject({ status: "COMPLETED", auto_closed: false }); // a completed session is final
    expect(by[over]!.session_notes).toHaveLength(1);
    const audit = await t.pool.query("select actor_user_id from audit_logs where entity_id = $1 and action = 'session.auto_close'", [over]);
    expect(audit.rows).toEqual([{ actor_user_id: null }]); // the system did it
  });

  it("generateSessions makes the sessions of every shop with an active rule, and is idempotent", async () => {
    const w = await workshop();
    await t.post(`/workshops/${w}/schedule-rules`, { weekdays: [0, 1, 2, 3, 4, 5, 6], startTimes: ["09:00"], effectiveFrom: "2020-01-01" }, { cookie: shop.cookie });
    await t.pool.query("delete from workshop_sessions where workshop_id = $1 and starts_at > now() + interval '10 days'", [w]); // as if the worker had not run for a while
    const before = (await t.pool.query("select count(*)::int as n from workshop_sessions where workshop_id = $1", [w])).rows[0]!.n as number;
    const first = await jobs.generateSessions();
    expect(first.shops).toBeGreaterThanOrEqual(1);
    expect(first.created).toBeGreaterThanOrEqual(1);
    const after = (await t.pool.query("select count(*)::int as n from workshop_sessions where workshop_id = $1", [w])).rows[0]!.n as number;
    expect(after).toBeGreaterThan(before);
    expect((await jobs.generateSessions()).created).toBe(0);
    const line = await t.pool.query("select actor_user_id, after from audit_logs where organization_id = $1 and action = 'schedule.generate'", [shop.orgId]);
    expect(line.rows.length).toBeGreaterThanOrEqual(1);
    expect(line.rows[0]!.actor_user_id).toBeNull();
  });
});
