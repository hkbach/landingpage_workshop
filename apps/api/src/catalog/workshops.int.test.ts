import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

const d = describe.skipIf(!TEST_DATABASE_URL);

const body = (over: Record<string, unknown> = {}) => ({
  title: { en: ` Pottery ${unique("w")} ` , vi: "Gốm" }, shortDescription: { en: "Throw a bowl" }, description: { en: "A relaxed class" }, includes: { en: ["Clay", " ", "Apron"] }, notes: { en: "Wear old clothes" },
  durationMinutes: 120, priceAmount: 850_000, defaultCapacity: 8, maxPerBooking: 4, coverUrl: "https://cdn.example.com/cover.jpg", galleryUrls: ["https://cdn.example.com/1.jpg", ""],
  categories: ["POTTERY", "CRAFTS"], address: " 12 Nguyen Hue ", addressNote: "2nd floor", sortOrder: 0, ...over,
});

d("workshops of a shop", () => {
  let t: TestApp;
  let a: { cookie: string; orgId: string };
  let b: { cookie: string; orgId: string };

  beforeAll(async () => {
    t = await startApp();
    const make = async (label: string) => {
      const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
      return { cookie: cookieOf(res), orgId: res.json().organization.id as string };
    };
    a = await make("wsa");
    b = await make("wsb");
    // the shop of the mock is in English and Vietnamese
    await t.pool.query("update organizations set enabled_locales = ARRAY['en','vi'] where id = any($1)", [[a.orgId, b.orgId]]);
  });
  afterAll(async () => { await t.close(); });

  it("creates a DRAFT workshop with trimmed texts, the currency of the shop and an audit line; needs a session and a shop", async () => {
    const res = await t.post("/workshops", body(), { cookie: a.cookie });
    expect(res.statusCode).toBe(201);
    const w = res.json();
    expect(w).toMatchObject({ status: "DRAFT", currency: "VND", priceAmount: 850_000, durationMinutes: 120, maxPerBooking: 4, address: "12 Nguyen Hue", sessions: { open: 0, total: 0 } });
    expect(w.title.en).toMatch(/^Pottery /); // trimmed
    expect(w.includes.en).toEqual(["Clay", "Apron"]); // an empty line is dropped
    expect(w.galleryUrls).toEqual(["https://cdn.example.com/1.jpg"]);
    const log = await t.pool.query<{ action: string }>("select action from audit_logs where entity_id = $1", [w.id]);
    expect(log.rows.map((r) => r.action)).toEqual(["workshop.create"]);
    expect((await t.post("/workshops", body(), {})).statusCode).toBe(401);
  });

  it("refuses wrong values with the codes of the form: the default language, a language that is not enabled, price, duration, capacity, categories, links", async () => {
    const check = async (over: Record<string, unknown>) => (await t.post("/workshops", body(over), { cookie: a.cookie })).json().error?.details?.fields ?? {};
    expect(await check({ title: { vi: "Gốm" } })).toEqual({ "title.en": "required" });
    expect(await check({ title: { en: "X", fr: "Poterie" } })).toHaveProperty("title");
    expect(await check({ description: { en: "ok", ko: "도예" } })).toEqual({ "description.ko": "notEnabled" });
    expect(await check({ priceAmount: -1 })).toHaveProperty("priceAmount", "priceInvalid");
    expect(await check({ priceAmount: 10.5 })).toHaveProperty("priceAmount", "priceInvalid");
    expect(await check({ durationMinutes: 10 })).toHaveProperty("durationMinutes", "durationRange");
    expect(await check({ defaultCapacity: 51 })).toHaveProperty("defaultCapacity", "capacityRange");
    expect(await check({ maxPerBooking: 9 })).toHaveProperty("maxPerBooking", "maxPerBookingRange");
    expect(await check({ categories: [] })).toHaveProperty("categories", "categoriesRequired");
    expect(await check({ categories: ["POTTERY", "CRAFTS", "COOKING", "BAKING"] })).toHaveProperty("categories");
    expect(Object.keys(await check({ categories: ["NOT_A_CATEGORY"] }))).toEqual(["categories.0"]); // the field of the element that is wrong
    expect(await check({ coverUrl: "http://insecure.example/a.jpg" })).toHaveProperty("coverUrl", "urlInvalid");
    expect(await check({ coverUrl: "javascript:alert(1)" })).toHaveProperty("coverUrl", "urlInvalid");
    expect(await check({ galleryUrls: Array.from({ length: 7 }, (_, i) => `https://cdn.example.com/${i}.jpg`) })).toHaveProperty("galleryUrls", "galleryMax");
    expect(await check({ address: "x".repeat(301) })).toHaveProperty("address", "tooLong");
  });

  it("lists, filters by status and by name in any language, and pages with a cursor", async () => {
    const tag = unique("list");
    const ids: string[] = [];
    for (let i = 0; i < 3; i++) ids.push((await t.post("/workshops", body({ title: { en: `Bread ${tag} ${i}`, vi: `Bánh mì ${i}` }, sortOrder: 100 + i }), { cookie: b.cookie })).json().id);
    const all = (await t.get(`/workshops?q=${tag}`, { cookie: b.cookie })).json();
    expect(all.items.map((w: { id: string }) => w.id)).toEqual(ids); // ordered by sort order
    expect((await t.get("/workshops?q=B%C3%A1nh", { cookie: b.cookie })).json().items.length).toBeGreaterThanOrEqual(3); // a Vietnamese name
    expect((await t.get(`/workshops?q=${tag}&status=ACTIVE`, { cookie: b.cookie })).json().items).toHaveLength(0);
    const first = (await t.get(`/workshops?q=${tag}&limit=2`, { cookie: b.cookie })).json();
    expect(first.items).toHaveLength(2);
    const second = (await t.get(`/workshops?q=${tag}&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`, { cookie: b.cookie })).json();
    expect([...first.items, ...second.items].map((w: { id: string }) => w.id)).toEqual(ids);
    expect(second.nextCursor).toBeNull();
    expect((await t.get("/workshops?cursor=garbage", { cookie: b.cookie })).statusCode).toBe(400);
    expect((await t.get("/workshops?q=%25", { cookie: b.cookie })).json().items).toHaveLength(0); // "%" is text, not a wildcard
  });

  it("edits only a draft, keeps the currency, audits the change of price; an active workshop must be deactivated first", async () => {
    const id = (await t.post("/workshops", body(), { cookie: a.cookie })).json().id;
    const edited = await t.app.inject({ method: "PUT", url: `/api/v1/workshops/${id}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: a.cookie }, payload: body({ priceAmount: 900_000, currency: "USD" }) as object });
    expect(edited.statusCode).toBe(200);
    expect(edited.json()).toMatchObject({ priceAmount: 900_000, currency: "VND" }); // a currency in the body is ignored
    const audit = await t.pool.query<{ action: string; before: { priceAmount: number }; after: { priceAmount: number } }>("select action, before, after from audit_logs where entity_id = $1 and action = 'workshop.update'", [id]);
    expect(audit.rows[0]).toMatchObject({ before: { priceAmount: 850_000 }, after: { priceAmount: 900_000 } });

    expect((await t.post(`/workshops/${id}/status`, { status: "ACTIVE" }, { cookie: a.cookie })).json()).toMatchObject({ status: "ACTIVE" });
    const refused = await t.app.inject({ method: "PUT", url: `/api/v1/workshops/${id}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: a.cookie }, payload: body() as object });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error.code).toBe("NOT_EDITABLE");
    expect((await t.post(`/workshops/${id}/status`, { status: "ACTIVE" }, { cookie: a.cookie })).json().error.code).toBe("STATUS");
    expect((await t.post(`/workshops/${id}/status`, { status: "DRAFT" }, { cookie: a.cookie })).json()).toMatchObject({ status: "DRAFT" }); // no sessions: can be deactivated
  });

  it("cannot deactivate while a session is still to come, says how many, and can once they are all closed", async () => {
    const id = (await t.post("/workshops", body(), { cookie: a.cookie })).json().id;
    await t.post(`/workshops/${id}/status`, { status: "ACTIVE" }, { cookie: a.cookie });
    for (const [i, status] of (["OPEN", "RUNNING"] as const).entries()) {
      await t.pool.query(
        `insert into workshop_sessions (organization_id, workshop_id, starts_at, ends_at, capacity, status, code) values ($1, $2, now() + interval '3 days' + $3::int * interval '1 day', now() + interval '3 days' + $3::int * interval '1 day' + interval '2 hours', 8, $4, $5)`,
        [a.orgId, id, i, status, `SES-${String(9000 + Math.floor(Math.random() * 900) + i * 1000).padStart(4, "0")}`],
      );
    }
    const refused = await t.post(`/workshops/${id}/status`, { status: "DRAFT" }, { cookie: a.cookie });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatchObject({ code: "SESSIONS_OPEN", details: { open: 2 } });
    await t.pool.query("update workshop_sessions set status = 'CLOSED' where workshop_id = $1", [id]);
    expect((await t.post(`/workshops/${id}/status`, { status: "DRAFT" }, { cookie: a.cookie })).statusCode).toBe(200);
    expect((await t.get(`/workshops/${id}`, { cookie: a.cookie })).json().sessions).toEqual({ open: 0, total: 2 });
  });

  it("a session whose time is over counts as closed at once, even before the worker ran", async () => {
    const id = (await t.post("/workshops", body(), { cookie: a.cookie })).json().id;
    await t.post(`/workshops/${id}/status`, { status: "ACTIVE" }, { cookie: a.cookie });
    await t.pool.query("insert into workshop_sessions (organization_id, workshop_id, starts_at, ends_at, capacity, status, code) values ($1, $2, now() - interval '3 hours', now() - interval '1 hour', 8, 'RUNNING', $3)", [a.orgId, id, `SES-${String(7000 + Math.floor(Math.random() * 999)).padStart(4, "0")}`]);
    expect((await t.post(`/workshops/${id}/status`, { status: "DRAFT" }, { cookie: a.cookie })).statusCode).toBe(200);
    const closed = await t.pool.query<{ status: string; auto_closed: boolean; session_notes: { type: string }[] }>("select status, auto_closed, session_notes from workshop_sessions where workshop_id = $1", [id]);
    expect(closed.rows[0]).toMatchObject({ status: "CLOSED", auto_closed: true });
    expect(closed.rows[0]!.session_notes.map((n) => n.type)).toEqual(["AUTO_CLOSED"]);
  });

  it("the shops are isolated: another shop's workshop is a 404 to read, edit or switch, and never in a list", async () => {
    const mine = (await t.post("/workshops", body({ title: { en: `Private ${unique("p")}` } }), { cookie: a.cookie })).json();
    const edit = await t.app.inject({ method: "PUT", url: `/api/v1/workshops/${mine.id}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: b.cookie }, payload: body() as object });
    expect(edit.statusCode).toBe(404);
    expect((await t.get(`/workshops/${mine.id}`, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await t.post(`/workshops/${mine.id}/status`, { status: "ACTIVE" }, { cookie: b.cookie })).statusCode).toBe(404);
    expect((await t.get("/workshops/not-a-uuid", { cookie: b.cookie })).statusCode).toBe(404); // the same answer
    expect((await t.get(`/workshops?limit=100`, { cookie: b.cookie })).json().items.some((w: { id: string }) => w.id === mine.id)).toBe(false);
    expect((await t.get(`/workshops/${mine.id}`, { cookie: a.cookie })).json().status).toBe("DRAFT"); // untouched
    // the database refuses it too: a session cannot point at another shop's workshop
    await expect(t.pool.query("insert into workshop_sessions (organization_id, workshop_id, starts_at, ends_at, capacity, code) values ($1, $2, now() + interval '9 days', now() + interval '9 days 2 hours', 5, 'SES-8888')", [b.orgId, mine.id])).rejects.toThrow(/workshop_sessions_workshop_fk/);
  });

  it("a suspended shop can read but not change", async () => {
    const id = (await t.post("/workshops", body(), { cookie: b.cookie })).json().id;
    await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [b.orgId]);
    try {
      expect((await t.get(`/workshops/${id}`, { cookie: b.cookie })).statusCode).toBe(200);
      const create = await t.post("/workshops", body(), { cookie: b.cookie });
      expect(create.statusCode).toBe(403);
      expect(create.json().error.code).toBe("SHOP_SUSPENDED");
      expect((await t.post(`/workshops/${id}/status`, { status: "ACTIVE" }, { cookie: b.cookie })).statusCode).toBe(403);
    } finally {
      await t.pool.query("update organizations set status = 'DRAFT' where id = $1", [b.orgId]);
    }
  });

  it("there is no way to delete a workshop", async () => {
    const id = (await t.post("/workshops", body(), { cookie: a.cookie })).json().id;
    const res = await t.app.inject({ method: "DELETE", url: `/api/v1/workshops/${id}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: a.cookie } });
    expect(res.statusCode).toBe(404);
    expect((await t.get(`/workshops/${id}`, { cookie: a.cookie })).statusCode).toBe(200);
  });
});
