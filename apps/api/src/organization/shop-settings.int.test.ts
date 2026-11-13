import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, drain, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";
import type { DnsResolver } from "./dns";

// The settings and the own domain of a shop on a real PostgreSQL (FR-ORG-02, FR-ADM-09, D13, D14): the owner and the administrator edit with the same rules, the slug never changes, the owner is told
// when the administrator edits, and an own domain counts only once its DNS is right.
const d = describe.skipIf(!TEST_DATABASE_URL);

let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.6`;

class FakeDns implements DnsResolver {
  readonly records = new Map<string, string[]>();
  async cname(host: string): Promise<string[]> {
    const v = this.records.get(host);
    if (!v) throw new Error("ENODATA");
    return v;
  }
}

d("settings and own domain of a shop", () => {
  let t: TestApp;
  const dns = new FakeDns();
  let admin: string;
  let a: { cookie: string; orgId: string; slug: string; email: string };
  let b: { cookie: string; orgId: string; slug: string };

  async function makeShop(label: string) {
    const email = emailFor(label);
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", email, `Shop ${unique(label)}`), { from: nextIp() });
    const orgId = res.json().organization.id as string;
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    return { cookie: cookieOf(res), orgId, slug: res.json().organization.slug as string, email };
  }
  const owner = (method: "GET" | "PATCH" | "PUT" | "POST", shop: { cookie: string }, url: string, payload?: unknown) =>
    t.app.inject({ method, url: `/api/v1${url}`, ...(payload !== undefined ? { payload: payload as object } : {}), remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: shop.cookie } });
  const adminSend = (method: "PATCH" | "GET", url: string, payload?: unknown, cookie = admin) =>
    t.app.inject({ method, url: `/api/v1/admin${url}`, ...(payload !== undefined ? { payload: payload as object } : {}), remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie } });
  const domainName = (): string => `${unique("d")}.example.com`;

  beforeAll(async () => {
    t = await startApp({}, { dns });
    const email = emailFor("shoproot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    a = await makeShop("shopa");
    b = await makeShop("shopb");
  });
  afterAll(async () => { await t.close(); });

  it("lets the owner change the settings with the rules of the form: trimmed, validated, only what is sent, never the slug, audited by name", async () => {
    const fields = async (body: unknown) => (await owner("PATCH", a, "/organization", body)).json().error?.details?.fields;
    expect(await fields({ name: "   " })).toEqual({ name: "required" });
    expect(await fields({ contactEmail: "nope" })).toEqual({ contactEmail: "invalid" });
    expect(await fields({ mapsUrl: "http://maps.example.test/x" })).toEqual({ mapsUrl: "invalid" });
    expect(await fields({ country: "Vietnam" })).toEqual({ country: "invalid" });
    expect(await fields({ timezone: "Mars/Base" })).toEqual({ timezone: "invalid" });
    expect(await fields({ currency: "ZZZ" })).toEqual({ currency: "invalid" }); // three letters, but not a currency
    expect(await fields({ currency: "dong" })).toEqual({ currency: "invalid" });
    expect(await fields({ enabledLocales: ["en", "vi"], defaultLocale: "ko" })).toEqual({ defaultLocale: "notEnabled" });
    expect(await fields({ enabledLocales: [] })).toEqual({ enabledLocales: "invalid" });
    expect(await fields({ enabledLocales: ["en", "xx"] })).toMatchObject({ "enabledLocales.1": "invalid" });
    expect((await owner("GET", a, "/organization")).json().name).not.toBe("Changed"); // nothing saved by the refused calls

    const before = (await owner("GET", a, "/organization")).json();
    const ok = await owner("PATCH", a, "/organization", { name: "  Whisk & Co ", contactPhone: " +84 90 111 2222 ", whatsapp: "+84 90 111 2222", address: " 1 Test Street ", country: "gb", timezone: "Asia/Bangkok", currency: "usd", enabledLocales: ["en", "vi"], defaultLocale: "vi", slug: "hacked-slug", status: "SUSPENDED" });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ slug: a.slug, status: "ACTIVE", name: "Whisk & Co", contactPhone: "+84 90 111 2222", address: "1 Test Street", country: "GB", timezone: "Asia/Bangkok", currency: "USD", defaultLocale: "vi", enabledLocales: ["en", "vi"] });
    expect(ok.json().changed.sort()).toEqual(["address", "contactPhone", "country", "currency", "defaultLocale", "enabledLocales", "name", "timezone", "whatsapp"]);
    expect(ok.json().warnings).toEqual([]); // no booking yet: nothing to warn about
    expect((await owner("GET", a, "/organization")).json().slug).toBe(before.slug); // a slug or a status in the body is ignored
    expect((await t.pool.query("select slug, status from organizations where id = $1", [a.orgId])).rows[0]).toEqual({ slug: a.slug, status: "ACTIVE" });
    const log = await t.pool.query<{ after: { fields: string[] }; text: string }>("select after, after::text as text from audit_logs where organization_id = $1 and action = 'shop.profile_update' order by created_at desc limit 1", [a.orgId]);
    expect(log.rows[0]!.after.fields.sort()).toEqual(ok.json().changed.sort());
    expect(log.rows[0]!.text).not.toMatch(/90 111|Test Street|Whisk/); // the names of the fields, never their content
    expect((await owner("PATCH", a, "/organization", { name: "Whisk & Co" })).json().changed).toEqual([]); // the same value: nothing changes, nothing is audited
    expect((await t.pool.query("select 1 from audit_logs where organization_id = $1 and action = 'shop.profile_update'", [a.orgId])).rowCount).toBe(1);

    // a booking exists: a new time zone or currency is allowed, the old data is not converted, and the screen is warned
    const w = await owner("POST", a, "/workshops", { title: { en: `W ${unique("w")}`, vi: `W ${unique("w")}` }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 10, maxPerBooking: 4, categories: ["COOKING"] });
    await owner("POST", a, `/workshops/${w.json().id}/status`, { status: "ACTIVE" });
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [a.orgId])).rows[0]!.n;
    const s = (await t.pool.query<{ id: string }>("insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code) select $1, $2, s, s, s + interval '1 hour', 10, 'RUNNING', $3 from (select now() + interval '3 days' as s) x returning id", [a.orgId, w.json().id, `SES-${String(seq).padStart(4, "0")}`])).rows[0]!;
    await t.app.inject({ method: "POST", url: "/api/v1/bookings", payload: { sessionId: s.id, quantity: 1, source: "WALK_IN", fullName: "Walk In" }, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: a.cookie, "idempotency-key": `shop-${unique("k")}-key` } });
    const warned = await owner("PATCH", a, "/organization", { timezone: "Asia/Singapore", currency: "SGD" });
    expect(warned.json().warnings.sort()).toEqual(["currencyChangedWithBookings", "timezoneChangedWithBookings"]);
    expect((await t.pool.query("select currency from bookings where organization_id = $1", [a.orgId])).rows[0]).toEqual({ currency: "USD" }); // the old booking keeps its own
    expect((await owner("PATCH", { cookie: "" }, "/organization", { name: "x" })).statusCode).toBe(401);
    expect((await owner("PATCH", b, "/organization", { name: "Only B" })).json().name).toBe("Only B");
    expect((await owner("GET", a, "/organization")).json().name).toBe("Whisk & Co"); // the shop of the session only
  });

  it("lets the platform administrator edit a shop: the same rules, the owner told by email, never the slug, a domain given or taken away", async () => {
    expect((await adminSend("PATCH", `/organizations/${b.orgId}`, { name: "x" }, a.cookie)).statusCode).toBe(403);
    expect((await adminSend("PATCH", `/organizations/${randomUUID()}`, { name: "x" })).statusCode).toBe(404);
    expect((await adminSend("PATCH", `/organizations/${b.orgId}`, { timezone: "Nowhere/Land" })).json().error.details.fields).toEqual({ timezone: "invalid" });
    const done = await adminSend("PATCH", `/organizations/${b.orgId}`, { name: "  Renamed By Admin ", mapsUrl: "https://maps.example.test/x", slug: "x", reason: "  Wrong name on the page  " });
    expect(done.statusCode).toBe(200);
    expect(done.json()).toMatchObject({ slug: b.slug, name: "Renamed By Admin", mapsUrl: "https://maps.example.test/x", changed: expect.arrayContaining(["name", "mapsUrl"]) });
    await drain(t);
    const mail = t.emails.sent.find((m) => m.subject.startsWith("The platform changed your shop") && m.text.includes("Wrong name on the page"));
    expect(mail).toBeDefined();
    expect(mail!.text).toContain("name, mapsUrl"); // what was changed, not the new values
    expect(mail!.text).not.toContain("Renamed By Admin");
    const log = await t.pool.query<{ actor_user_id: string; after: { by: string } }>("select actor_user_id, after from audit_logs where organization_id = $1 and action = 'shop.profile_update' order by created_at desc limit 1", [b.orgId]);
    expect(log.rows[0]!.after.by).toBe("ADMIN");
    expect(log.rows[0]!.actor_user_id).not.toBeNull();
    // the owner's own edit sends no email
    const sentBefore = t.emails.sent.length;
    await owner("PATCH", b, "/organization", { name: "Owner Again" });
    await drain(t);
    expect(t.emails.sent.length).toBe(sentBefore);

    const domain = domainName();
    const withDomain = await adminSend("PATCH", `/organizations/${b.orgId}`, { customDomain: `https://${domain.toUpperCase()}/home?x=1` });
    expect(withDomain.json()).toMatchObject({ customDomain: domain, customDomainVerified: false });
    expect((await adminSend("PATCH", `/organizations/${a.orgId}`, { customDomain: domain })).json().error.code).toBe("DOMAIN_TAKEN");
    expect((await adminSend("PATCH", `/organizations/${a.orgId}`, { customDomain: "studio.localtest.me" })).json().error.details.fields).toEqual({ domain: "platform" });
    expect((await adminSend("PATCH", `/organizations/${b.orgId}`, { customDomain: "" })).json().customDomain).toBeNull();
    const dlog = await t.pool.query<{ action: string; after: { by?: string } }>("select action, after from audit_logs where organization_id = $1 and action like 'shop.domain_%' order by created_at", [b.orgId]);
    expect(dlog.rows.map((r) => r.action)).toEqual(["shop.domain_set", "shop.domain_remove"]);
    expect(dlog.rows[0]!.after.by).toBe("ADMIN");
  });

  it("gives a shop an own domain that counts only after its DNS is right, one shop for each domain, and tells the front server which shop a domain is", async () => {
    const info = await owner("GET", a, "/shop/domain");
    expect(info.json()).toEqual({ domain: "", verified: false, target: `${a.slug}.localtest.me` });
    const fields = async (domain: string) => (await owner("PUT", a, "/shop/domain", { domain })).json().error?.details?.fields;
    expect(await fields("localhost")).toEqual({ domain: "invalid" });
    expect(await fields("192.168.1.10")).toEqual({ domain: "invalid" });
    expect(await fields("single")).toEqual({ domain: "invalid" });
    expect(await fields("my.localtest.me")).toEqual({ domain: "platform" });
    expect(await fields("a".repeat(301))).toEqual({ domain: "tooLong" });
    expect((await owner("PUT", a, "/shop/domain", {})).statusCode).toBe(422);

    const domain = domainName();
    const put = await owner("PUT", a, "/shop/domain", { domain: `  https://WWW.${domain}/some/page?x=1 ` });
    expect(put.json()).toEqual({ domain: `www.${domain}`, verified: false, target: `${a.slug}.localtest.me` }); // a pasted address works
    expect((await owner("PUT", b, "/shop/domain", { domain: `www.${domain}` })).json().error.code).toBe("DOMAIN_TAKEN");
    expect((await t.get(`/public/domains/www.${domain}`)).statusCode).toBe(404); // not verified: not served

    // the DNS does not point to the platform yet
    expect((await owner("POST", a, "/shop/domain/verify")).json()).toMatchObject({ verified: false, found: [] });
    dns.records.set(`www.${domain}`, ["somewhere-else.example.net."]);
    expect((await owner("POST", a, "/shop/domain/verify")).json()).toMatchObject({ verified: false, found: ["somewhere-else.example.net"] });
    dns.records.set(`www.${domain}`, [`${a.slug.toUpperCase()}.localtest.me.`]); // the right name, however it is written
    const ok = await owner("POST", a, "/shop/domain/verify");
    expect(ok.json()).toMatchObject({ domain: `www.${domain}`, verified: true, target: `${a.slug}.localtest.me` });
    expect((await owner("GET", a, "/shop/domain")).json().verified).toBe(true);
    expect((await t.get(`/public/domains/WWW.${domain.toUpperCase()}`)).json()).toEqual({ slug: a.slug }); // any case

    // a shop that is not ACTIVE is not served on its own domain either
    await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [a.orgId]);
    expect((await t.get(`/public/domains/www.${domain}`)).statusCode).toBe(404);
    expect((await owner("PUT", a, "/shop/domain", { domain: "" })).statusCode).toBe(403); // and a suspended shop cannot change it
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [a.orgId]);

    // a new domain has to be checked again; removing it frees it for another shop
    const other = domainName();
    expect((await owner("PUT", a, "/shop/domain", { domain: other })).json()).toMatchObject({ domain: other, verified: false });
    expect((await t.get(`/public/domains/${other}`)).statusCode).toBe(404);
    expect((await owner("PUT", a, "/shop/domain", { domain: "" })).json()).toMatchObject({ domain: "", verified: false });
    expect((await owner("POST", a, "/shop/domain/verify")).json().error.code).toBe("NO_DOMAIN");
    expect((await owner("PUT", b, "/shop/domain", { domain: `www.${domain}` })).statusCode).toBe(200); // it is free now
    const log = await t.pool.query<{ action: string }>("select action from audit_logs where organization_id = $1 and action like 'shop.domain_%' order by created_at", [a.orgId]);
    expect(log.rows.map((r) => r.action)).toEqual(["shop.domain_set", "shop.domain_verify", "shop.domain_set", "shop.domain_remove"]);
    expect((await owner("PUT", { cookie: "" }, "/shop/domain", { domain: "x.example.com" })).statusCode).toBe(401);
  });

  it("answers the front server which hosts may get a certificate: the platform, the active shops and the verified own domains, and nothing else", async () => {
    const ask = async (domain: string) => (await t.get(`/public/tls/ask?domain=${encodeURIComponent(domain)}`)).statusCode;
    // the platform's own hosts and the host of an ACTIVE shop
    expect(await ask("localtest.me")).toBe(200);
    expect(await ask("app.localtest.me")).toBe(200);
    expect(await ask(`${a.slug}.localtest.me`)).toBe(200);
    expect(await ask(`${a.slug.toUpperCase()}.LOCALTEST.ME`)).toBe(200);
    // a host nobody owns, a shop that does not exist, a name with a dot before the platform domain, nonsense
    expect(await ask("no-such-shop-anywhere.localtest.me")).toBe(404);
    expect(await ask(`x.${a.slug}.localtest.me`)).toBe(404);
    for (const bad of ["", "localhost", "evil.example.com", "a b.example.com", "-x.example.com", "x".repeat(300) + ".com", "../etc", "192.168.0.1"]) expect(await ask(bad), bad).toBe(404);
    expect((await t.get("/public/tls/ask")).statusCode).toBe(404); // no domain at all
    // a shop that is not ACTIVE gets nothing
    await t.pool.query("update organizations set status = 'SUSPENDED' where id = $1", [a.orgId]);
    expect(await ask(`${a.slug}.localtest.me`)).toBe(404);
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [a.orgId]);
    // an own domain: only once its DNS was checked
    const own = domainName();
    await owner("PUT", b, "/shop/domain", { domain: `www.${own}` });
    expect(await ask(`www.${own}`)).toBe(404);
    dns.records.set(`www.${own}`, [`${b.slug}.localtest.me.`]);
    await owner("POST", b, "/shop/domain/verify");
    expect(await ask(`www.${own}`)).toBe(200);
    expect(await ask(`other.${own}`)).toBe(404);
    expect((await t.get(`/public/tls/ask?domain=${encodeURIComponent(`www.${own}`)}`)).json()).toEqual({}); // the answer carries no data
  });
});
