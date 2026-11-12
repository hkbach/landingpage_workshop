import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken } from "./crypto";
import { PASSWORD, ORIGIN, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// Signup, login, sessions, CSRF and the isolation of the shops, on a real PostgreSQL (TEST_DATABASE_URL) with the whole API running and emails kept in memory.
const d = describe.skipIf(!TEST_DATABASE_URL);

d("signup and login (a demo: the email is not verified first)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await startApp({ REQUIRE_EMAIL_VERIFICATION: "false" }); });
  afterAll(async () => { await t.close(); });

  it("signs up a customer, answers like the mock login, logs in with an HttpOnly cookie and stores only hashes", async () => {
    const email = emailFor("cust");
    const res = await t.post("/auth/signup", signupBody("CUSTOMER", email));
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ type: "CUSTOMER", email });
    const header = String(res.headers["set-cookie"]);
    expect(header).toMatch(/^wsp_sid=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax; Max-Age=\d+$/); // not Secure: the app url is http in development
    expect(header).not.toContain("Secure");

    const { rows } = await t.pool.query<{ password_hash: string; status: string }>("select password_hash, status from users where email = $1", [email]);
    expect(rows[0]!.password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0]!.password_hash).not.toContain(PASSWORD);
    expect(rows[0]!.status).toBe("ACTIVE");

    const token = decodeURIComponent(cookieOf(res).split("=")[1]!);
    const session = await t.pool.query("select 1 from auth_sessions where token_hash = $1", [hashToken(token)]);
    expect(session.rowCount).toBe(1); // the table holds the hash of the cookie, never the cookie itself
    expect((await t.pool.query("select 1 from auth_sessions where token_hash = $1", [token])).rowCount).toBe(0);

    const me = await t.get("/auth/me", { cookie: cookieOf(res) });
    expect(me.json()).toMatchObject({ type: "CUSTOMER", email });
  });

  it("signs up a shop owner: the shop (DRAFT) and its slug come from the name, the slug stays free of clashes, everything is audited", async () => {
    const name = `Clay ${unique("c")} Studio`;
    const email = emailFor("owner");
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", email, name));
    expect(res.statusCode).toBe(201);
    const me = res.json();
    expect(me).toMatchObject({ type: "SHOP_OWNER", organization: { name, status: "DRAFT" } });
    expect(me.organization.slug).toMatch(/^clay-[a-z0-9]+-studio$/);

    const second = (await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("owner"), name))).json();
    expect(second.organization.slug).toBe(`${me.organization.slug}-2`);

    const audit = await t.pool.query<{ action: string }>("select action from audit_logs where organization_id = $1 order by created_at", [me.organization.id]);
    expect(audit.rows.map((r) => r.action)).toEqual(expect.arrayContaining(["auth.signup", "organization.create"]));
    const member = await t.pool.query("select role from organization_members where organization_id = $1", [me.organization.id]);
    expect(member.rows).toEqual([{ role: "OWNER" }]);
  });

  it("refuses a taken email (any case), a weak password and a password that does not match, with the codes the forms know", async () => {
    const email = emailFor("dup");
    expect((await t.post("/auth/signup", signupBody("CUSTOMER", email))).statusCode).toBe(201);
    const taken = await t.post("/auth/signup", signupBody("CUSTOMER", email.toUpperCase()));
    expect(taken.statusCode).toBe(409);
    expect(taken.json().error.code).toBe("EMAIL_TAKEN");

    const weak = await t.post("/auth/signup", signupBody("CUSTOMER", emailFor("weak"), undefined, "short"));
    expect(weak.statusCode).toBe(422);
    expect(weak.json().error.details.fields).toEqual({ password: "tooShort" });
    const mismatch = await t.post("/auth/signup", { ...signupBody("CUSTOMER", emailFor("mm")), confirmPassword: "something else entirely" });
    expect(mismatch.json().error.details.fields).toEqual({ confirmPassword: "mismatch" });
    const invalid = await t.post("/auth/signup", signupBody("CUSTOMER", "not-an-email"));
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.details.fields.email).toBe("invalid");
  });

  it("logs in with the right password; an unknown email and a wrong password get the very same answer", async () => {
    const email = emailFor("login");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    const ok = await t.post("/auth/login", { email: email.toUpperCase(), password: PASSWORD });
    expect(ok.statusCode).toBe(200);
    expect(cookieOf(ok)).toMatch(/^wsp_sid=/);

    const wrong = await t.post("/auth/login", { email, password: "A-wrong-password-1" }, { from: "10.2.2.2" });
    const unknown = await t.post("/auth/login", { email: emailFor("ghost"), password: "A-wrong-password-1" }, { from: "10.2.2.3" });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    const strip = (r: typeof wrong) => { const { requestId: _r, ...rest } = r.json().error; void _r; return rest; };
    expect(strip(wrong)).toEqual(strip(unknown));
    expect(wrong.headers["set-cookie"]).toBeUndefined();
  });

  it("locks one client out of one email after five failures, but not another client (nobody can lock the owner out from elsewhere)", async () => {
    const email = emailFor("lock");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    for (let i = 0; i < 5; i++) expect((await t.post("/auth/login", { email, password: "A-wrong-password-1" }, { from: "10.3.3.3" })).statusCode).toBe(401);
    const locked = await t.post("/auth/login", { email, password: PASSWORD }, { from: "10.3.3.3" }); // even the right password
    expect(locked.statusCode).toBe(429);
    expect(locked.json().error).toMatchObject({ code: "RATE_LIMITED" });
    expect(locked.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect((await t.post("/auth/login", { email, password: PASSWORD }, { from: "10.4.4.4" })).statusCode).toBe(200);
    const { rows } = await t.pool.query("select 1 from audit_logs where action = 'auth.login_locked' and actor_user_id = (select id from users where email = $1)", [email]);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("logs out (the cookie is removed and the session is gone), and a request without a session is 401", async () => {
    const email = emailFor("out");
    const cookie = cookieOf(await t.post("/auth/signup", signupBody("CUSTOMER", email)));
    expect((await t.get("/auth/me")).statusCode).toBe(401);
    const out = await t.post("/auth/logout", {}, { cookie });
    expect(out.statusCode).toBe(200);
    expect(String(out.headers["set-cookie"])).toContain("Max-Age=0");
    expect((await t.get("/auth/me", { cookie })).statusCode).toBe(401); // the old cookie is useless now
  });

  it("ends a session that expired or whose account was disabled", async () => {
    const email = emailFor("exp");
    const cookie = cookieOf(await t.post("/auth/signup", signupBody("CUSTOMER", email)));
    await t.pool.query("update auth_sessions set expires_at = now() - interval '1 minute' where user_id = (select id from users where email = $1)", [email]);
    expect((await t.get("/auth/me", { cookie })).statusCode).toBe(401);

    const second = cookieOf((await t.post("/auth/login", { email, password: PASSWORD })));
    expect((await t.get("/auth/me", { cookie: second })).statusCode).toBe(200);
    await t.pool.query("update users set status = 'DISABLED' where email = $1", [email]);
    expect((await t.get("/auth/me", { cookie: second })).statusCode).toBe(401);
    const login = await t.post("/auth/login", { email, password: PASSWORD });
    expect(login.statusCode).toBe(403);
    expect(login.json().error.code).toBe("DEACTIVATED");
  });
});

d("CSRF: a request that changes something must come from the web app", () => {
  let t: TestApp;
  beforeAll(async () => { t = await startApp(); });
  afterAll(async () => { await t.close(); });

  it("refuses another site's Origin, even to log in, and accepts the app's", async () => {
    const email = emailFor("csrf");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    const evil = await t.post("/auth/login", { email, password: PASSWORD }, { headers: { origin: "https://evil.example" } });
    expect(evil.statusCode).toBe(403);
    expect(evil.json().error.code).toBe("FORBIDDEN_ORIGIN");
    expect(evil.headers["set-cookie"]).toBeUndefined();
    expect((await t.post("/auth/login", { email, password: PASSWORD }, { headers: { origin: ORIGIN } })).statusCode).toBe(200);
    expect((await t.post("/auth/login", { email, password: PASSWORD }, { headers: { origin: "null" } })).statusCode).toBe(403);
  });

  it("with a session cookie and no Origin or Referer the request is refused; the Referer of the app is enough", async () => {
    const cookie = cookieOf(await t.post("/auth/signup", signupBody("CUSTOMER", emailFor("csrf2"))));
    const bare = (headers: Record<string, string>) => t.app.inject({ method: "POST", url: "/api/v1/auth/logout", headers: { cookie, ...headers }, payload: {} });
    expect((await bare({})).statusCode).toBe(403);
    expect((await bare({ referer: "https://evil.example/page" })).statusCode).toBe(403);
    expect((await bare({ referer: `${ORIGIN}/customer/x/today` })).statusCode).toBe(200);
  });

  it("lets a script without a cookie and without Origin through (it has no session to forge)", async () => {
    const res = await t.app.inject({ method: "POST", url: "/api/v1/auth/login", payload: { email: emailFor("nobody"), password: "A-wrong-password-1" } });
    expect(res.statusCode).toBe(401); // reached the login, not the CSRF check
  });
});

d("the isolation of the shops (tenants)", () => {
  let t: TestApp;
  let a: { cookie: string; org: { id: string; slug: string } };
  let b: { cookie: string; org: { id: string; slug: string } };
  let customerCookie: string;

  beforeAll(async () => {
    t = await startApp();
    const make = async (label: string) => {
      const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
      return { cookie: cookieOf(res), org: res.json().organization as { id: string; slug: string } };
    };
    a = await make("tenanta");
    b = await make("tenantb");
    customerCookie = cookieOf(await t.post("/auth/signup", signupBody("CUSTOMER", emailFor("tenantc"))));
    // Give each shop several audit lines, so there is something to leak.
    for (let i = 0; i < 4; i++) await t.pool.query("insert into audit_logs (organization_id, action, entity_type, entity_id) values ($1, 'test.line', 'test', $2), ($3, 'test.line', 'test', $4)", [a.org.id, `a-${i}`, b.org.id, `b-${i}`]);
  });
  afterAll(async () => { await t.close(); });

  it("each owner sees only their own shop, and a shop id in the query or the path changes nothing", async () => {
    expect((await t.get("/organization", { cookie: a.cookie })).json()).toMatchObject({ id: a.org.id, slug: a.org.slug });
    expect((await t.get("/organization", { cookie: b.cookie })).json()).toMatchObject({ id: b.org.id });
    const sneaky = await t.get(`/organization?organizationId=${b.org.id}&org=${b.org.slug}`, { cookie: a.cookie });
    expect(sneaky.json().id).toBe(a.org.id);
    expect((await t.get(`/organizations/${b.org.id}`, { cookie: a.cookie })).statusCode).toBe(404);
  });

  it("the audit log of a shop holds only the lines of that shop, page after page, without gaps or repeats", async () => {
    const ids = async (cookie: string) => {
      const seen: { id: string; entityId: string }[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 20; page++) {
        const res = await t.get(`/audit-logs?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cookie });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { items: { id: string; entityId: string }[]; nextCursor: string | null };
        seen.push(...body.items);
        cursor = body.nextCursor;
        if (!cursor) break;
      }
      return seen;
    };
    const mine = await ids(a.cookie);
    const theirs = await ids(b.cookie);
    expect(mine.length).toBeGreaterThanOrEqual(6);
    expect(new Set(mine.map((r) => r.id)).size).toBe(mine.length); // no repeats
    expect(mine.filter((r) => r.entityId.startsWith("a-")).length).toBe(4);
    expect(mine.some((r) => r.entityId.startsWith("b-"))).toBe(false);
    expect(theirs.some((r) => r.entityId.startsWith("a-"))).toBe(false);
    const own = await t.pool.query("select id from audit_logs where organization_id = $1", [a.org.id]);
    expect(new Set(mine.map((r) => r.id))).toEqual(new Set(own.rows.map((r) => r.id)));
    expect((await t.get("/audit-logs?cursor=garbage", { cookie: a.cookie })).statusCode).toBe(400);
    expect((await t.get("/audit-logs?limit=1000", { cookie: a.cookie })).statusCode).toBe(422);
  });

  it("a customer (no shop) and a visitor (no session) get nothing", async () => {
    const customer = await t.get("/organization", { cookie: customerCookie });
    expect(customer.statusCode).toBe(403);
    expect(customer.json().error.code).toBe("NO_ORGANIZATION");
    expect((await t.get("/audit-logs", { cookie: customerCookie })).statusCode).toBe(403);
    expect((await t.get("/organization")).statusCode).toBe(401);
    expect((await t.get("/audit-logs", { cookie: "wsp_sid=forged-token-not-in-the-database" })).statusCode).toBe(401);
  });

  it("a member who is disabled loses the shop at once", async () => {
    const own = await t.pool.query("update organization_members set status = 'DISABLED' where organization_id = $1 returning user_id", [b.org.id]);
    expect((await t.get("/organization", { cookie: b.cookie })).statusCode).toBe(403);
    await t.pool.query("update organization_members set status = 'ACTIVE' where organization_id = $1 and user_id = $2", [b.org.id, own.rows[0]!.user_id]);
    expect((await t.get("/organization", { cookie: b.cookie })).statusCode).toBe(200);
  });
});
