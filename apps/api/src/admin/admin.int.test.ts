import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, drain, emailFor, linkIn, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The platform administrator on a real PostgreSQL: who may enter, the shops and users lists, suspend / reactivate, disable an account, the reset link and the audit log of the platform.
const d = describe.skipIf(!TEST_DATABASE_URL);

d("the platform administrator", () => {
  let t: TestApp;
  let admin: { cookie: string; id: string; email: string };
  let owner: { cookie: string; orgId: string; slug: string; userId: string; email: string };
  let customer: { cookie: string; userId: string; email: string };

  const as = (cookie: string) => ({ cookie });
  const getA = (url: string, cookie = admin.cookie) => t.get(`/admin${url}`, as(cookie));
  const postA = (url: string, body: unknown = {}, cookie = admin.cookie) => t.post(`/admin${url}`, body, as(cookie));

  beforeAll(async () => {
    t = await startApp();
    // An administrator is made in the database (there is no signup for one), then logs in like anybody else.
    const email = emailFor("root");
    const id = (await t.pool.query<{ id: string }>("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN') returning id", [email, await hashPassword(PASSWORD)])).rows[0]!.id;
    admin = { cookie: cookieOf(await t.post("/auth/login", { email, password: PASSWORD })), id, email };
    const oe = emailFor("adminowner");
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", oe, `Shop ${unique("ao")}`));
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [res.json().organization.id]);
    owner = { cookie: cookieOf(res), orgId: res.json().organization.id, slug: res.json().organization.slug, userId: res.json().id, email: oe };
    const ce = emailFor("admincust");
    const cres = await t.post("/auth/signup", signupBody("CUSTOMER", ce));
    customer = { cookie: cookieOf(cres), userId: cres.json().id, email: ce };
  });
  afterAll(async () => { await t.close(); });

  it("lets only a SUPER_ADMIN in: a visitor is 401, a shop owner and a customer are 403 on every endpoint", async () => {
    for (const url of ["/organizations", "/users", "/audit-logs", `/organizations/${owner.orgId}`]) {
      expect((await t.get(`/admin${url}`)).statusCode, url).toBe(401);
      expect((await getA(url, owner.cookie)).statusCode, url).toBe(403);
      expect((await getA(url, customer.cookie)).json().error.code, url).toBe("FORBIDDEN");
    }
    for (const [url, body] of [[`/organizations/${owner.orgId}/status`, { active: false, reason: "x" }], [`/users/${customer.userId}/status`, { status: "DISABLED", reason: "x" }], [`/users/${customer.userId}/reset-password`, {}]] as const) {
      expect((await postA(url, body, owner.cookie)).statusCode, url).toBe(403);
    }
    expect((await getA("/organizations")).statusCode).toBe(200);
    // nothing changed by the refused calls
    expect((await t.pool.query("select status from organizations where id = $1", [owner.orgId])).rows[0]).toEqual({ status: "ACTIVE" });
  });

  it("lists the shops with their owner and counts, filters and searches them, pages with a cursor, and shows one", async () => {
    const list = (await getA(`/organizations?q=${owner.slug}`)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: owner.orgId, slug: owner.slug, status: "ACTIVE", ownerEmail: owner.email, workshopCount: 0, bookings30d: 0 });
    expect((await getA("/organizations?status=SUSPENDED&limit=100")).json().items.every((o: { status: string }) => o.status === "SUSPENDED")).toBe(true);
    const p1 = (await getA("/organizations?limit=2")).json();
    expect(p1.items).toHaveLength(2);
    const p2 = (await getA(`/organizations?limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)).json();
    expect(p2.items.some((o: { id: string }) => p1.items.some((x: { id: string }) => x.id === o.id))).toBe(false);
    expect((await getA("/organizations?cursor=bad")).statusCode).toBe(400);
    expect((await getA("/organizations?q=%25")).json().items).toHaveLength(0);

    const one = (await getA(`/organizations/${owner.orgId}`)).json();
    expect(one).toMatchObject({ id: owner.orgId, slug: owner.slug, counts: { workshops: 0, bookings: 0, customers: 0 } });
    expect(one.owners.map((u: { email: string }) => u.email)).toEqual([owner.email]);
    expect(JSON.stringify(one)).not.toMatch(/password|hash|token/i);
    expect((await getA(`/organizations/${customer.userId}`)).statusCode).toBe(404);
    expect((await getA("/organizations/not-a-uuid")).statusCode).toBe(404);
  });

  it("suspends an active shop with a reason (the public page disappears, the shop becomes read only) and reactivates it; everything is audited by the administrator", async () => {
    expect((await postA(`/organizations/${owner.orgId}/status`, { active: false })).json().error.details.fields).toEqual({ reason: "required" });
    expect((await postA(`/organizations/${owner.orgId}/status`, { active: false, reason: "   " })).statusCode).toBe(422);
    expect((await postA(`/organizations/${owner.orgId}/status`, { active: true })).json().error.code).toBe("STATUS"); // it is not suspended
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${owner.slug}` })).statusCode).toBe(200);

    const done = await postA(`/organizations/${owner.orgId}/status`, { active: false, reason: "  Reported for fake prices  " });
    expect(done.json()).toEqual({ id: owner.orgId, status: "SUSPENDED" });
    expect((await getA(`/organizations/${owner.orgId}`)).json()).toMatchObject({ status: "SUSPENDED", statusReason: "Reported for fake prices" });
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${owner.slug}` })).statusCode).toBe(404); // the page is gone for guests
    expect((await t.get("/organization", as(owner.cookie))).statusCode).toBe(200); // the owner can still read
    const write = await t.post("/workshops", { title: { en: "x" }, durationMinutes: 60, priceAmount: 1, defaultCapacity: 2, maxPerBooking: 1, categories: ["COOKING"] }, as(owner.cookie));
    expect(write.json().error.code).toBe("SHOP_SUSPENDED");
    expect((await postA(`/organizations/${owner.orgId}/status`, { active: false, reason: "again" })).json().error.code).toBe("STATUS");

    expect((await postA(`/organizations/${owner.orgId}/status`, { active: true })).json()).toEqual({ id: owner.orgId, status: "ACTIVE" });
    expect((await getA(`/organizations/${owner.orgId}`)).json().statusReason).toBeNull();
    expect((await t.app.inject({ method: "GET", url: `/api/v1/public/sites/${owner.slug}` })).statusCode).toBe(200);

    const log = await t.pool.query<{ action: string; actor_user_id: string; before: unknown; after: { reason?: string } }>("select action, actor_user_id, before, after from audit_logs where organization_id = $1 and action like 'organization.%' and action <> 'organization.create' order by created_at", [owner.orgId]);
    expect(log.rows.map((r) => r.action)).toEqual(["organization.suspend", "organization.reactivate"]);
    expect(log.rows.every((r) => r.actor_user_id === admin.id)).toBe(true);
    expect(log.rows[0]!.after.reason).toBe("Reported for fake prices"); // trimmed
  });

  it("lists the users with their type, never a password; filters by type, status and search; pages", async () => {
    const all = (await getA("/users?limit=100")).json();
    expect(JSON.stringify(all)).not.toMatch(/password|argon2/i);
    const find = (email: string) => all.items.find((u: { email: string }) => u.email === email);
    expect(find(admin.email)).toMatchObject({ type: "SUPER_ADMIN", status: "ACTIVE", shopSlug: null });
    expect(find(owner.email)).toMatchObject({ type: "SHOP_OWNER", shopSlug: owner.slug });
    expect(find(customer.email)).toMatchObject({ type: "CUSTOMER", shopSlug: null, emailVerified: false });
    expect((await getA("/users?type=SHOP_OWNER&limit=100")).json().items.every((u: { type: string }) => u.type === "SHOP_OWNER")).toBe(true);
    expect((await getA("/users?type=CUSTOMER&limit=100")).json().items.some((u: { email: string }) => u.email === customer.email)).toBe(true);
    expect((await getA("/users?type=SUPER_ADMIN&limit=100")).json().items.some((u: { email: string }) => u.email === owner.email)).toBe(false);
    expect((await getA(`/users?q=${encodeURIComponent(customer.email.slice(0, 14))}`)).json().items.length).toBeGreaterThanOrEqual(1);
    const p1 = (await getA("/users?limit=3")).json();
    const p2 = (await getA(`/users?limit=3&cursor=${encodeURIComponent(p1.nextCursor)}`)).json();
    expect(p1.items.length + p2.items.length).toBe(6);
    expect(p2.items.every((u: { id: string }) => !p1.items.some((x: { id: string }) => x.id === u.id))).toBe(true);
  });

  it("disables an account with a reason: every session ends, it cannot log in, and re-enabling lets it back; an administrator cannot disable themselves", async () => {
    expect((await postA(`/users/${customer.userId}/status`, { status: "DISABLED" })).json().error.details.fields).toEqual({ reason: "required" });
    expect((await postA(`/users/${admin.id}/status`, { status: "DISABLED", reason: "oops" })).json().error.code).toBe("SELF");
    expect((await t.get("/auth/me", as(customer.cookie))).statusCode).toBe(200);
    expect((await postA(`/users/${customer.userId}/status`, { status: "DISABLED", reason: "Abuse" })).json()).toEqual({ id: customer.userId, status: "DISABLED" });
    expect((await t.get("/auth/me", as(customer.cookie))).statusCode).toBe(401); // the session is gone
    const login = await t.post("/auth/login", { email: customer.email, password: PASSWORD });
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe("DEACTIVATED");
    expect((await postA(`/users/${customer.userId}/status`, { status: "DISABLED", reason: "again" })).json().error.code).toBe("STATUS");
    expect((await postA(`/users/${customer.userId}/status`, { status: "ACTIVE" })).statusCode).toBe(200);
    expect((await t.post("/auth/login", { email: customer.email, password: PASSWORD })).statusCode).toBe(200);
    expect((await postA(`/users/${admin.id.replace(/.$/, "0")}/status`, { status: "ACTIVE" })).statusCode).toBe(404);
    const log = await t.pool.query<{ action: string; after: { targetEmail: string } }>("select action, after from audit_logs where entity_id = $1 and action like 'user.%' order by created_at", [customer.userId]);
    expect(log.rows.map((r) => r.action)).toEqual(["user.deactivate", "user.activate"]);
    expect(log.rows[0]!.after.targetEmail).toBe(customer.email);
  });

  it("sends the account a reset link by email (the administrator never sees it); a disabled account gets none", async () => {
    expect((await postA(`/users/${owner.userId}/reset-password`)).statusCode).toBe(202);
    await drain(t);
    const { token } = linkIn(t.emails, owner.email);
    const reset = await t.post("/auth/reset-password", { token, password: "Another-pass-2027", confirmPassword: "Another-pass-2027" });
    expect(reset.statusCode).toBe(200);
    expect((await t.get("/auth/me", as(owner.cookie))).statusCode).toBe(401); // a reset logs the account out everywhere
    owner.cookie = cookieOf(await t.post("/auth/login", { email: owner.email, password: "Another-pass-2027" }));
    expect(owner.cookie).toMatch(/^wsp_sid=/);
    const log = await t.pool.query<{ actor_user_id: string; after: { targetEmail: string } }>("select actor_user_id, after from audit_logs where entity_id = $1 and action = 'user.reset_password'", [owner.userId]);
    expect(log.rows).toEqual([{ actor_user_id: admin.id, after: { targetEmail: owner.email } }]);
    expect(JSON.stringify(log.rows)).not.toContain(token);

    await postA(`/users/${customer.userId}/status`, { status: "DISABLED", reason: "x" });
    expect((await postA(`/users/${customer.userId}/reset-password`)).json().error.code).toBe("STATUS");
    await postA(`/users/${customer.userId}/status`, { status: "ACTIVE" });
    expect((await postA(`/users/${admin.id.replace(/.$/, "0")}/reset-password`)).statusCode).toBe(404);
  });

  it("reads the audit log of the whole platform with filters (who, which shop, what, when) and a cursor, with the actor of each line", async () => {
    const byActor = (await getA(`/audit-logs?email=${encodeURIComponent(admin.email)}&limit=100`)).json();
    expect(byActor.items.length).toBeGreaterThanOrEqual(5);
    expect(byActor.items.every((l: { actorEmail: string }) => l.actorEmail === admin.email)).toBe(true);
    expect(byActor.items.map((l: { action: string }) => l.action)).toEqual(expect.arrayContaining(["organization.suspend", "organization.reactivate", "user.deactivate", "user.reset_password"]));
    expect(byActor.items[0].createdAt >= byActor.items.at(-1).createdAt).toBe(true); // newest first

    const byShop = (await getA(`/audit-logs?org=${owner.slug}&limit=100`)).json();
    expect(byShop.items.length).toBeGreaterThanOrEqual(3);
    expect(byShop.items.every((l: { organizationSlug: string }) => l.organizationSlug === owner.slug)).toBe(true);
    expect((await getA(`/audit-logs?org=${owner.orgId}`)).json().items.length).toBeGreaterThanOrEqual(3); // by id too
    expect((await getA("/audit-logs?action=organization.suspend&limit=100")).json().items.every((l: { action: string }) => l.action === "organization.suspend")).toBe(true);
    expect((await getA("/audit-logs?entityType=user&limit=100")).json().items.every((l: { entityType: string }) => l.entityType === "user")).toBe(true);
    expect((await getA("/audit-logs?from=2999-01-01T00:00:00Z")).json().items).toHaveLength(0);
    expect((await getA("/audit-logs?from=yesterday")).statusCode).toBe(422);
    expect((await getA(`/audit-logs?org=${owner.slug}&email=nobody-at-all`)).json().items).toHaveLength(0);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 40; i++) {
      const res: { items: { id: string }[]; nextCursor: string | null } = (await getA(`/audit-logs?org=${owner.slug}&limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)).json();
      seen.push(...res.items.map((l) => l.id));
      cursor = res.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length); // no line twice
    expect(seen.length).toBe(byShop.items.length); // and none missing
    const system = await t.pool.query("insert into audit_logs (organization_id, action, entity_type, entity_id) values ($1, 'session.auto_close', 'session', 'x') returning id", [owner.orgId]);
    expect((await getA(`/audit-logs?org=${owner.slug}&action=session.auto_close`)).json().items.find((l: { id: string }) => l.id === system.rows[0].id)).toMatchObject({ actor: "SYSTEM", actorEmail: null });
  });

  it("an administrator has no way to change the slug of a shop (it never changes, not even for them)", async () => {
    for (const method of ["PATCH", "PUT"] as const) {
      const res = await t.app.inject({ method, url: `/api/v1/admin/organizations/${owner.orgId}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: admin.cookie }, payload: { slug: "hijacked" } });
      expect(res.statusCode).toBe(404);
    }
    await expect(t.pool.query("update organizations set slug = 'hijacked-shop' where id = $1", [owner.orgId])).rejects.toThrow(/cannot be changed/);
    expect((await getA(`/organizations/${owner.orgId}`)).json().slug).toBe(owner.slug);
  });
});
