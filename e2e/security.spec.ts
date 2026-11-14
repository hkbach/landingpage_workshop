import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { acceptLegal, APP, login, open, seedPassword, SHOP } from "./helpers";

// Security and access rules against the REAL API (docs/E2E_TEST_CASES.md, section 2.12, the P0 cases E2E-SEC-*). Mostly through the API, the way an attacker would call it, with a check of the
// screens where a person would see the difference. Needs the stack of e2e/README.md and the seeded accounts (E2E_PASSWORD or apps/api/.seed-credentials).
const OWNER_A = "linh@whiskladle.example"; // the active shop whiskladle
const OWNER_B = "ava@sugarsift.example"; // another shop (a draft one)
const ADMIN = "admin@workshopkit.example";
const PASSWORD = "Real-Stack-Pass-123";
const headers = { origin: APP };

/** A client of the API with its own cookie jar, logged in as `email`. */
async function as(email: string, password = seedPassword()): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext();
  const res = await ctx.post(`${APP}/api/v1/auth/login`, { headers, data: { email, password } });
  expect(res.status(), `login of ${email}`).toBe(200);
  await acceptLegal(ctx);
  return ctx;
}

/** A new customer account (a signup counts in the limit of 10 per hour per address of the API: the file makes two). */
async function newCustomer(): Promise<{ ctx: APIRequestContext; id: string; email: string }> {
  const ctx = await playwrightRequest.newContext();
  const email = `sec-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const res = await ctx.post(`${APP}/api/v1/auth/signup`, { headers, data: { type: "CUSTOMER", email, password: PASSWORD, confirmPassword: PASSWORD } });
  expect(res.status(), "signup (429: the API allows 10 signups an hour from one address; restart the API to reset)").toBe(201);
  await acceptLegal(ctx);
  return { ctx, id: ((await res.json()) as { id: string }).id, email };
}

const first = async <T>(ctx: APIRequestContext, path: string): Promise<T | undefined> => ((await (await ctx.get(`${APP}/api/v1${path}`)).json()) as { items: T[] }).items[0];

test.describe("security and access rules on the real API", () => {
  test("E2E-SEC-05: an owner who guesses the ids of another shop gets 404 on every kind of record, and nothing changes", async () => {
    const a = await as(OWNER_A);
    const b = await as(OWNER_B);
    try {
      const ids = {
        workshop: (await first<{ id: string }>(a, "/workshops"))?.id,
        session: (await first<{ id: string }>(a, "/sessions"))?.id,
        booking: (await first<{ id: string; status: string }>(a, "/bookings"))?.id,
        customer: (await first<{ id: string }>(a, "/customers"))?.id,
        page: (await first<{ id: string }>(a, "/site/pages"))?.id,
      };
      for (const [kind, id] of Object.entries(ids)) expect(id, `shop A has a ${kind}`).toBeTruthy();
      const reads: Array<[string, string]> = [
        ["workshop", `/workshops/${ids.workshop}`], ["session", `/sessions/${ids.session}`], ["booking", `/bookings/${ids.booking}`], ["customer", `/customers/${ids.customer}`], ["page", `/site/pages/${ids.page}`],
      ];
      for (const [kind, path] of reads) expect((await b.get(`${APP}/api/v1${path}`)).status(), `read a ${kind} of shop A`).toBe(404);

      const before = (await (await a.get(`${APP}/api/v1/bookings/${ids.booking}`)).json()) as { status: string };
      const writes: Array<[string, () => Promise<{ status(): number }>]> = [
        ["cancel a booking", () => b.post(`${APP}/api/v1/bookings/${ids.booking}/cancel`, { headers, data: { reason: "guessed" } })],
        ["check a booking in", () => b.post(`${APP}/api/v1/bookings/${ids.booking}/check-in`, { headers })],
        ["close a session", () => b.post(`${APP}/api/v1/sessions/${ids.session}/close`, { headers, data: { reason: { code: "OTHER", note: "guessed" } } })],
        ["deactivate a workshop", () => b.post(`${APP}/api/v1/workshops/${ids.workshop}/status`, { headers, data: { status: "DRAFT" } })],
        ["publish a page", () => b.post(`${APP}/api/v1/site/pages/${ids.page}/publish`, { headers })],
      ];
      for (const [what, call] of writes) expect((await call()).status(), what).toBe(404);
      const after = (await (await a.get(`${APP}/api/v1/bookings/${ids.booking}`)).json()) as { status: string };
      expect(after.status).toBe(before.status);
    } finally {
      await a.dispose();
      await b.dispose();
    }
  });

  test("E2E-SEC-06 / SEC-04 / SEC-14: the admin API is closed to others, a customer reads only their own account, and no password hash is ever sent", async () => {
    const visitor = await playwrightRequest.newContext();
    const owner = await as(OWNER_A);
    const one = await newCustomer();
    const other = await newCustomer();
    const admin = await as(ADMIN);
    try {
      for (const path of ["/admin/organizations", "/admin/users", "/admin/media", "/admin/audit-logs"]) {
        expect((await visitor.get(`${APP}/api/v1${path}`)).status(), `visitor ${path}`).toBe(401);
        expect((await owner.get(`${APP}/api/v1${path}`)).status(), `owner ${path}`).toBe(403);
        expect((await one.ctx.get(`${APP}/api/v1${path}`)).status(), `customer ${path}`).toBe(403);
      }
      expect((await owner.post(`${APP}/api/v1/admin/users/${one.id}/status`, { headers, data: { status: "DISABLED", reason: "x" } })).status()).toBe(403);

      // a customer reads their own account, never another one
      expect((await one.ctx.get(`${APP}/api/v1/customer/${one.id}`)).status()).toBe(200);
      for (const path of ["", "/bookings", "/wallet", "/favorites"]) {
        expect([403, 404], `another account ${path}`).toContain((await one.ctx.get(`${APP}/api/v1/customer/${other.id}${path}`)).status());
      }

      // no password, no hash, no token in what the administrator reads about the users
      const users = await (await admin.get(`${APP}/api/v1/admin/users?q=${encodeURIComponent(one.email)}`)).text();
      expect(users).toContain(one.email);
      expect(users).not.toMatch(/password|passwordHash|password_hash|\$argon2|tokenHash/i);
    } finally {
      for (const c of [visitor, owner, one.ctx, other.ctx, admin]) await c.dispose();
    }
  });

  test("E2E-SEC-13: a customer the administrator deactivates is out at once, even with the session they had", async () => {
    const victim = await newCustomer();
    const admin = await as(ADMIN);
    try {
      expect((await victim.ctx.get(`${APP}/api/v1/auth/me`)).status()).toBe(200);
      const off = await admin.post(`${APP}/api/v1/admin/users/${victim.id}/status`, { headers, data: { status: "DISABLED", reason: "e2e security test" } });
      expect(off.status()).toBe(200);
      expect((await victim.ctx.get(`${APP}/api/v1/auth/me`)).status()).toBe(401);
    } finally {
      await victim.ctx.dispose();
      await admin.dispose();
    }
  });

  test("E2E-SEC-07: a change that does not come from the app is refused (Origin of another site, Origin null, no Origin with a cookie)", async () => {
    const owner = await as(OWNER_A);
    try {
      const before = (await (await owner.get(`${APP}/api/v1/organization`)).json()) as { contactPhone: string };
      const change = { contactPhone: "+84 90 000 0000" };
      for (const [label, extra] of [["another site", { origin: "http://evil.example" }], ["Origin null", { origin: "null" }], ["no Origin", {}]] as const) {
        const res = await owner.patch(`${APP}/api/v1/organization`, { headers: extra, data: change });
        expect(res.status(), label).toBe(403);
        expect(((await res.json()) as { error: { code: string } }).error.code, label).toBe("FORBIDDEN_ORIGIN");
      }
      expect(((await (await owner.get(`${APP}/api/v1/organization`)).json()) as { contactPhone: string }).contactPhone).toBe(before.contactPhone);
    } finally {
      await owner.dispose();
    }
  });

  test("E2E-SEC-09 / SEC-10: the session cookie is HttpOnly and SameSite=Lax, and the pages send a CSP with a nonce and no inline script", async ({ page }) => {
    await login(page, OWNER_A, seedPassword());
    const cookie = (await page.context().cookies()).find((c) => c.name === "wsp_sid");
    expect(cookie, "the session cookie").toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe("Lax");
    for (const url of [`${APP}/`, `${SHOP}/`, `${APP}/shopowner/whiskladle`]) {
      const res = await page.request.get(url);
      const csp = res.headers()["content-security-policy"] ?? "";
      expect(csp, url).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);
      expect(csp, url).not.toMatch(/script-src[^;]*'unsafe-inline'/);
      expect(csp, url).toContain("frame-ancestors");
    }
  });

  test("E2E-SEC-02 / SEC-03 / SEC-11: each area opens only for its own people; the admin area is never served on a shop host", async ({ browser }) => {
    // nobody logged in: every private area sends to the log in
    const anon = await browser.newPage();
    for (const path of ["/shopowner/whiskladle", "/systemadmin", "/customer/00000000-0000-4000-8000-000000000000/today"]) {
      await open(anon, `${APP}${path}`);
      await expect(anon, path).toHaveURL(/auth=login/, { timeout: 60_000 });
    }
    await anon.close();

    // the owner of another shop: not the admin area, not shop A — back to their own area
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await login(page, OWNER_B, seedPassword());
    for (const path of ["/systemadmin", "/shopowner/whiskladle"]) {
      await open(page, `${APP}${path}`);
      await expect(page, path).toHaveURL(/\/shopowner\/(onboarding|sugarsift)/, { timeout: 60_000 });
    }
    await ctx.close();

    // on the host of a shop, /systemadmin is a path of the shop's site, never the admin area
    const res = await (await browser.newPage()).goto(`${SHOP}/systemadmin`, { waitUntil: "domcontentloaded" });
    expect(res?.status()).toBe(404);
  });
});
