import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, drain, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// What the platform administrator keeps and handles, on a real PostgreSQL: the settings, the support channels, the Contact messages, the reports of a site and the Terms and Privacy.
const d = describe.skipIf(!TEST_DATABASE_URL);

let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.2`;

d("the platform administrator: settings, inbox, reports and legal", () => {
  let t: TestApp;
  let admin: string;
  let owner: { cookie: string; orgId: string; slug: string };
  let customer: { cookie: string; id: string; email: string };

  const publicPost = (url: string, payload: unknown, from = nextIp()) => t.app.inject({ method: "POST", url: `/api/v1${url}`, payload: payload as object, remoteAddress: from, headers: { origin: "https://some-site.example" } });
  const adminSend = (method: "GET" | "PUT" | "PATCH" | "DELETE" | "POST", url: string, payload?: unknown, cookie = admin) =>
    t.app.inject({ method, url: `/api/v1/admin${url}`, ...(payload !== undefined ? { payload: payload as object } : {}), remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie } });
  const contact = (over: Record<string, unknown> = {}, from = nextIp()) => publicPost("/public/contact", { name: "  Ava Tran ", email: ` ${emailFor("sender").toUpperCase()} `, topic: "support", message: "  I cannot open my booking page, please help.  ", ...over }, from);

  beforeAll(async () => {
    t = await startApp();
    await t.pool.query("truncate legal_documents, legal_versions, legal_consents");
    await t.pool.query("delete from platform_settings"); // the platform starts from its defaults
    const email = emailFor("platroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("platowner"), `Shop ${unique("p")}`), { from: nextIp() });
    owner = { cookie: cookieOf(res), orgId: res.json().organization.id, slug: res.json().organization.slug };
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [owner.orgId]);
    const ce = emailFor("platcust");
    const cres = await t.post("/auth/signup", signupBody("CUSTOMER", ce), { from: nextIp() });
    customer = { cookie: cookieOf(cres), id: cres.json().id, email: ce };
  });
  afterAll(async () => {
    await adminSend("PUT", "/settings", { resetLinkHours: 24, contactPerHour: 5 }); // the test leaves the platform as it found it
    await t.pool.query("truncate legal_documents, legal_versions, legal_consents");
    await t.close();
  });

  it("holds the numbers of the platform: defaults, a range for each, audited with the old and the new value, for the administrator only", async () => {
    expect((await adminSend("GET", "/settings")).json()).toEqual({ resetLinkHours: 24, contactPerHour: 5, contactRetentionMonths: 12, emailRetentionDays: 90 });
    expect((await adminSend("GET", "/settings", undefined, owner.cookie)).statusCode).toBe(403);
    expect((await t.get("/admin/settings")).statusCode).toBe(401);
    const fields = async (body: unknown) => (await adminSend("PUT", "/settings", body)).json().error?.details?.fields;
    expect(await fields({ resetLinkHours: 0, contactPerHour: 5 })).toEqual({ resetLinkHours: "range" });
    expect(await fields({ resetLinkHours: 169, contactPerHour: 101 })).toEqual({ resetLinkHours: "range", contactPerHour: "range" });
    expect(await fields({ resetLinkHours: 12.5, contactPerHour: 5 })).toEqual({ resetLinkHours: "range" });
    expect(await fields({ resetLinkHours: 12, contactPerHour: 5, contactRetentionMonths: 0, emailRetentionDays: 6 })).toEqual({ contactRetentionMonths: "range", emailRetentionDays: "range" });
    expect(await fields({ resetLinkHours: 12, contactPerHour: 5, contactRetentionMonths: 121 })).toEqual({ contactRetentionMonths: "range" });
    expect((await adminSend("PUT", "/settings", { resetLinkHours: 12 })).statusCode).toBe(422);
    expect((await adminSend("GET", "/settings")).json()).toEqual({ resetLinkHours: 24, contactPerHour: 5, contactRetentionMonths: 12, emailRetentionDays: 90 }); // nothing saved by the refused calls

    expect((await adminSend("PUT", "/settings", { resetLinkHours: 12, contactPerHour: 2 })).json()).toEqual({ resetLinkHours: 12, contactPerHour: 2, contactRetentionMonths: 12, emailRetentionDays: 90 }); // what is left out keeps its value
    const log = await t.pool.query<{ after: { changes: { name: string; from: number; to: number }[] } }>("select after from audit_logs where entity_id = 'settings' and action = 'platform.settings_update' order by created_at desc limit 1");
    expect(log.rows[0]!.after.changes).toEqual([{ name: "resetLinkHours", from: 24, to: 12 }, { name: "contactPerHour", from: 5, to: 2 }]);

    // the reset link an administrator sends lives as long as the setting says
    expect((await adminSend("POST", `/users/${customer.id}/reset-password`, {})).statusCode).toBe(202);
    const token = (await t.pool.query<{ hours: string }>("select (extract(epoch from expires_at - created_at) / 3600)::numeric(6,2) as hours from user_tokens where user_id = $1 and type = 'PASSWORD_RESET' order by created_at desc limit 1", [customer.id])).rows[0]!;
    expect(Number(token.hours)).toBe(12);
    await drain(t);

    // and so does the limit of the Contact form (2 an hour for a client now)
    const from = nextIp();
    expect((await contact({}, from)).statusCode).toBe(201);
    expect((await contact({}, from)).statusCode).toBe(201);
    const limited = await contact({}, from);
    expect([limited.statusCode, limited.json().error.code]).toEqual([429, "RATE_LIMITED"]);
    expect(limited.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
    expect((await contact({}, nextIp())).statusCode).toBe(201); // another client is not held
    await adminSend("PUT", "/settings", { resetLinkHours: 24, contactPerHour: 5 });
  });

  it("keeps the support channels, checks them, and shows them to a shop owner or a customer who is logged in, never to a visitor", async () => {
    expect((await adminSend("GET", "/support-contact")).json()).toEqual({ whatsapp: "", phone: "", zalo: "", email: "" });
    const fields = async (body: unknown) => (await adminSend("PUT", "/support-contact", body)).json().error?.details?.fields;
    expect(await fields({ whatsapp: "12345", phone: "", zalo: "", email: "" })).toEqual({ whatsapp: "invalid" }); // fewer than 7 digits
    expect(await fields({ whatsapp: "", phone: "call me maybe", zalo: "", email: "" })).toEqual({ phone: "invalid" });
    expect(await fields({ whatsapp: "", phone: "1".repeat(16), zalo: "", email: "" })).toEqual({ phone: "invalid" }); // more than 15
    expect(await fields({ whatsapp: "", phone: "", zalo: "", email: "not-an-email" })).toEqual({ email: "invalid" });
    expect((await adminSend("PUT", "/support-contact", { whatsapp: "+84 90 123 4567", phone: "(028) 3822-0000", zalo: "", email: "help@example.test" }, owner.cookie)).statusCode).toBe(403);
    expect((await adminSend("GET", "/support-contact")).json().phone).toBe(""); // nothing saved by the refused calls

    const saved = await adminSend("PUT", "/support-contact", { whatsapp: "  +84 90 123 4567 ", phone: "(028) 3822-0000", zalo: "", email: " help@example.test " });
    expect(saved.json()).toEqual({ whatsapp: "+84 90 123 4567", phone: "(028) 3822-0000", zalo: "", email: "help@example.test" });
    for (const cookie of [owner.cookie, customer.cookie]) expect((await t.get("/support-contact", { cookie })).json()).toEqual(saved.json());
    expect((await t.get("/support-contact")).statusCode).toBe(401); // never on a public page
    expect((await t.get(`/public/sites/${owner.slug}`)).body).not.toContain("help@example.test");
    // a channel left empty is removed; the audit names the channels that changed, not what is in them
    expect((await adminSend("PUT", "/support-contact", { whatsapp: "", phone: "(028) 3822-0000", zalo: "", email: "help@example.test" })).json().whatsapp).toBe("");
    const log = await t.pool.query<{ after: { channels: string[] }; text: string }>("select after, after::text as text from audit_logs where entity_id = 'support_contact' order by created_at desc limit 2");
    expect(log.rows.map((r) => r.after.channels)).toEqual([["whatsapp"], ["whatsapp", "phone", "email"]]);
    expect(log.rows.map((r) => r.text).join()).not.toMatch(/90 123|help@example|3822/);
    await adminSend("PUT", "/support-contact", { whatsapp: "", phone: "", zalo: "", email: "" });
  });

  it("takes a message from the Contact form, throws away a robot's, and lets the administrator read, note, answer and delete it", async () => {
    const fields = async (over: Record<string, unknown>) => (await contact(over)).json().error?.details?.fields;
    expect(await fields({ name: "   " })).toEqual({ name: "required" });
    expect(await fields({ email: "nope" })).toEqual({ email: "invalid" });
    expect(await fields({ topic: "spam" })).toEqual({ topic: "invalid" });
    expect(await fields({ message: "too short" })).toEqual({ message: "tooShort" });
    expect(await fields({ message: "x".repeat(2001) })).toEqual({ message: "tooLong" });

    const email = emailFor("sender");
    const made = await contact({ email: `  ${email.toUpperCase()} `, message: "  Please call me back about the booking <b>page</b>.  " }, nextIp());
    expect(made.statusCode).toBe(201);
    const id = made.json().id as string;
    const robot = await contact({ website: "https://spam.example", message: "Buy my product now, a very good price" });
    expect(robot.statusCode).toBe(201);
    expect((await t.pool.query("select 1 from contact_messages where message like 'Buy my product%'")).rowCount).toBe(0); // told it worked, nothing kept
    const log = await t.pool.query("select after::text as a from audit_logs where entity_id = $1 and action = 'contact.submit'", [id]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]!.a).not.toMatch(/callback|Please call/); // the audit says that a message came, and its topic, not what it said

    const list = (await adminSend("GET", `/directory/messages?q=${encodeURIComponent(email)}`)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id, name: "Ava Tran", email, topic: "support", status: "NEW", note: "", message: "Please call me back about the booking <b>page</b>." }); // kept as text
    expect(list.counts.NEW).toBeGreaterThanOrEqual(1);
    expect((await adminSend("GET", "/directory/messages?status=DONE&q=" + encodeURIComponent(email))).json().items).toEqual([]);
    expect((await adminSend("GET", "/directory/messages?topic=partnership&q=" + encodeURIComponent(email))).json().items).toEqual([]);
    expect((await adminSend("GET", "/directory/messages", undefined, owner.cookie)).statusCode).toBe(403);

    expect((await adminSend("PATCH", `/messages/${id}`, { status: "IN_PROGRESS", note: "Phone number is 0901 — called back twice" }, owner.cookie)).statusCode).toBe(403);
    expect((await adminSend("PATCH", `/messages/${id}`, { note: "x".repeat(2100) })).json().error.details.fields).toEqual({ note: "tooLong" });
    expect((await adminSend("PATCH", `/messages/${id}`, { status: "IN_PROGRESS", note: "Phone number is 0901 — called back twice" })).json()).toEqual({ id, status: "IN_PROGRESS", note: "Phone number is 0901 — called back twice" });
    expect((await adminSend("PATCH", `/messages/${randomUUID()}`, { status: "DONE" })).statusCode).toBe(404);
    const audit = await t.pool.query<{ action: string; text: string }>("select action, (coalesce(before::text, '') || coalesce(after::text, '')) as text from audit_logs where entity_id = $1 and action like 'message.%' order by created_at", [id]);
    expect(audit.rows.map((r) => r.action)).toEqual(["message.set_status", "message.set_note"]);
    expect(audit.rows.map((r) => r.text).join()).not.toMatch(/0901|called back/); // the note is not in the audit log

    // the answer is an email to the sender (through the system emails), never the internal note, and the message is DONE
    const reply = await adminSend("POST", `/messages/${id}/reply`, { subject: "About your booking page", body: "Hello,\n\nWe fixed the page. <script>alert(1)</script>\n\nThe team" });
    expect(reply.json()).toEqual({ id, status: "DONE" });
    await drain(t);
    const sent = t.emails.sent.find((m) => m.to === email && m.subject === "About your booking page");
    expect(sent).toBeDefined();
    expect(sent!.text).toContain("We fixed the page.");
    expect(sent!.text).not.toMatch(/0901|called back/); // not the note
    expect(sent!.html).not.toContain("<script>"); // plain text: escaped
    expect((await adminSend("POST", `/messages/${id}/reply`, { body: "" })).json().error.details.fields).toEqual({ body: "required" });
    expect((await adminSend("GET", `/directory/messages?q=${encodeURIComponent(email)}`)).json().items[0].status).toBe("DONE");

    expect((await adminSend("DELETE", `/messages/${id}`, undefined, owner.cookie)).statusCode).toBe(403);
    expect((await adminSend("DELETE", `/messages/${id}`)).statusCode).toBe(204);
    expect((await adminSend("DELETE", `/messages/${id}`)).statusCode).toBe(404);
    expect((await t.pool.query("select 1 from contact_messages where id = $1", [id])).rowCount).toBe(0); // gone for good
  });

  it("takes a report of a site only for an active shop, 5 an hour from one client, and lets the administrator resolve or dismiss each once", async () => {
    const report = (over: Record<string, unknown> = {}, from = nextIp(), slug = owner.slug) => publicPost(`/public/sites/${slug}/reports`, { reason: "SCAM", description: "  They take money and never run the workshop at all.  ", email: " Reporter@Example.test ", ...over }, from);
    const fields = async (over: Record<string, unknown>) => (await report(over)).json().error?.details?.fields;
    expect(await fields({ reason: "RUDE" })).toEqual({ reason: "required" });
    expect(await fields({ description: "short" })).toEqual({ description: "descriptionShort" });
    expect(await fields({ email: "nope" })).toEqual({ email: "email" });
    expect((await report({}, nextIp(), "no-such-shop")).statusCode).toBe(404);
    const draft = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("draftshop"), `Draft ${unique("d")}`), { from: nextIp() });
    expect((await report({}, nextIp(), draft.json().organization.slug)).statusCode).toBe(404); // a shop that is not ACTIVE is the same 404

    const first = await report({}, nextIp());
    expect(first.statusCode).toBe(201);
    const second = await report({ reason: "PHISHING", email: undefined, description: "A page that asks for card numbers, which looks fake." }, nextIp());
    const ids = { first: first.json().id as string, second: second.json().id as string };
    const heavy = nextIp();
    for (let i = 0; i < 5; i++) expect((await report({}, heavy)).statusCode).toBe(201);
    expect((await report({}, heavy)).statusCode).toBe(429); // the sixth from one client in an hour

    const list = (await adminSend("GET", `/reports?shop=${owner.slug}&sort=oldest`)).json();
    expect(list.items.length).toBeGreaterThanOrEqual(7);
    expect(list.items[0]).toMatchObject({ shopSlug: owner.slug, status: "OPEN", reporterEmail: "reporter@example.test" });
    expect(list.counts).toMatchObject({ OPEN: expect.any(Number) });
    expect(list.shops).toContain(owner.slug);
    expect((await adminSend("GET", `/reports?reason=PHISHING&shop=${owner.slug}`)).json().items.map((r: { id: string }) => r.id)).toEqual([ids.second]);
    expect((await adminSend("GET", `/reports?q=card+numbers&shop=${owner.slug}`)).json().items).toHaveLength(1);
    expect((await adminSend("GET", "/reports?status=NOPE")).statusCode).toBe(422);
    expect((await adminSend("GET", "/reports", undefined, owner.cookie)).statusCode).toBe(403);

    const decide = (id: string, body: unknown, cookie = admin) => adminSend("PATCH", `/reports/${id}`, body, cookie);
    expect((await decide(ids.first, { status: "RESOLVED" }, owner.cookie)).statusCode).toBe(403);
    expect((await decide(ids.first, { status: "OPEN" })).statusCode).toBe(422);
    expect((await decide(ids.first, { status: "RESOLVED", note: "x".repeat(501) })).json().error.details.fields).toEqual({ note: "tooLong" });
    expect((await decide(randomUUID(), { status: "RESOLVED" })).statusCode).toBe(404);
    const done = await decide(ids.first, { status: "RESOLVED", note: "  Shop contacted  " });
    expect(done.json()).toMatchObject({ id: ids.first, status: "RESOLVED", note: "Shop contacted" });
    expect(done.json().handledBy).toBeTruthy();
    expect((await decide(ids.first, { status: "DISMISSED" })).json().error.code).toBe("INVALID_TRANSITION"); // only an open report
    expect((await decide(ids.second, { status: "DISMISSED" })).json()).toMatchObject({ status: "DISMISSED" });
    const log = await t.pool.query<{ action: string; organization_id: string }>("select action, organization_id from audit_logs where entity_id = any($1) and action like 'report.%' order by action", [[ids.first, ids.second]]);
    expect(log.rows.map((r) => r.action)).toEqual(["report.dismiss", "report.resolve", "report.submit", "report.submit"]);
    expect(log.rows.every((r) => r.organization_id === owner.orgId)).toBe(true);
  });

  it("keeps the Terms and the Privacy for each language as plain text: a draft is written first and goes live only when published, English is the fallback", async () => {
    const empty = (await adminSend("GET", "/legal/terms")).json();
    expect(empty).toMatchObject({ kind: "terms", epoch: 0, documents: {}, drafts: {} });
    expect((await t.get("/public/legal/terms?locale=vi")).json()).toEqual({ kind: "terms", available: false }); // nothing yet
    expect((await adminSend("GET", "/legal/other")).statusCode).toBe(422);
    expect((await adminSend("PUT", "/legal/terms", { locale: "en", content: "x" }, owner.cookie)).statusCode).toBe(403);
    expect((await adminSend("PUT", "/legal/terms", { locale: "xx", content: "x" })).json().error.details.fields).toEqual({ locale: "invalid" });
    expect((await adminSend("PUT", "/legal/terms", { locale: "en", content: "x".repeat(50_001) })).json().error.details.fields).toEqual({ content: "tooLong" });
    expect((await adminSend("POST", "/legal/terms/publish", { locale: "en" })).json().error.code).toBe("NO_DRAFT");

    // saving writes a draft: nothing is live
    const text = "# Terms\n\nYou may use the service.\n\n- Be kind\n- <script>alert(1)</script>";
    const saved = (await adminSend("PUT", "/legal/terms", { locale: "en", content: `  ${text}  ` })).json();
    expect(saved.drafts.en).toMatchObject({ content: text, version: 1 });
    expect(saved.documents.en).toBeUndefined();
    expect((await t.get("/public/legal/terms?locale=en")).json()).toEqual({ kind: "terms", available: false });
    expect((await adminSend("PUT", "/legal/terms", { locale: "en", content: `${text}\n\nMore.` })).json().drafts.en).toMatchObject({ content: `${text}\n\nMore.`, version: 1 }); // the draft is corrected in place

    // publishing makes it live as that version; the draft is gone
    const live = (await adminSend("POST", "/legal/terms/publish", { locale: "en" })).json();
    expect(live.documents.en).toMatchObject({ content: `${text}\n\nMore.`, version: 1 });
    expect(live.documents.en.updatedBy).toBeTruthy();
    expect(live.drafts.en).toBeUndefined();
    expect(live.epoch).toBe(0);
    const ko = (await t.get("/public/legal/terms?locale=ko")).json();
    expect(ko).toMatchObject({ locale: "en", fallback: true, version: 1, epoch: 0 });
    expect(ko.content).toContain("<script>alert(1)</script>"); // kept as text: the page shows it as text, never as HTML

    // each language and each document has its own versions
    await adminSend("PUT", "/legal/terms", { locale: "vi", content: "Điều khoản" });
    expect((await adminSend("POST", "/legal/terms/publish", { locale: "vi" })).json().documents.vi.version).toBe(1);
    await adminSend("PUT", "/legal/privacy", { locale: "en", content: "Privacy text" });
    await adminSend("POST", "/legal/privacy/publish", { locale: "en" });
    expect((await t.get("/public/legal/terms?locale=vi")).json()).toMatchObject({ available: true, locale: "vi", fallback: false, version: 1, content: "Điều khoản" });
    expect((await t.get("/public/legal/privacy?locale=ja")).json()).toMatchObject({ locale: "en", fallback: true, content: "Privacy text" });

    // a new draft of a live text: the live one does not change until the publish
    await adminSend("PUT", "/legal/terms", { locale: "en", content: "Terms, second text" });
    expect((await t.get("/public/legal/terms?locale=en")).json()).toMatchObject({ version: 1 });
    expect((await adminSend("PUT", "/legal/terms", { locale: "en", content: "   " })).json().drafts.en).toBeUndefined(); // an empty text throws the draft away
    expect((await t.get("/public/legal/terms?locale=en")).json()).toMatchObject({ version: 1, content: `${text}\n\nMore.` }); // and the live text stays
    await adminSend("PUT", "/legal/terms", { locale: "en", content: "Terms, second text" });
    expect((await adminSend("POST", "/legal/terms/publish", { locale: "en" })).json().documents.en).toMatchObject({ version: 2, content: "Terms, second text" });

    // taking a language off the page keeps its history
    expect((await adminSend("DELETE", "/legal/terms/vi")).json().documents.vi).toBeUndefined();
    expect((await adminSend("DELETE", "/legal/terms/vi")).statusCode).toBe(404);
    expect((await t.get("/public/legal/terms?locale=vi")).json()).toMatchObject({ locale: "en", fallback: true });

    const log = await t.pool.query<{ after: string }>("select coalesce(after::text, '') as after from audit_logs where entity_id like 'terms:%' and action like 'legal.%'");
    expect(log.rows.length).toBeGreaterThanOrEqual(8);
    expect(log.rows.map((r) => r.after).join()).not.toMatch(/Terms|kind|Điều|script/); // the text is not in the audit log
  });

  it("keeps every version: the history can be read, a published version is never changed or deleted, and it can be put back as a draft", async () => {
    const versions = (await adminSend("GET", "/legal/terms/versions?locale=en")).json();
    expect(versions.items.map((v: { version: number; status: string }) => [v.version, v.status])).toEqual([[2, "PUBLISHED"], [1, "PUBLISHED"]]);
    expect(versions.items[0]).toMatchObject({ major: false, epoch: 0 });
    expect(versions.items[0].publishedBy).toBeTruthy();
    expect((await adminSend("GET", "/legal/terms/versions?locale=xx")).statusCode).toBe(422);
    const old = (await adminSend("GET", "/legal/terms/versions/1?locale=en")).json();
    expect(old).toMatchObject({ version: 1, status: "PUBLISHED" });
    expect(old.content).toContain("Be kind");
    expect((await adminSend("GET", "/legal/terms/versions/9?locale=en")).statusCode).toBe(404);
    expect((await adminSend("GET", "/legal/terms/versions/abc?locale=en")).statusCode).toBe(422);

    // the database itself refuses to change or delete what was published
    await expect(t.pool.query("update legal_versions set content = 'tampered' where kind = 'terms' and locale = 'en' and version = 1")).rejects.toThrow(/published version cannot be changed/);
    await expect(t.pool.query("delete from legal_versions where kind = 'terms' and locale = 'en' and version = 1")).rejects.toThrow(/published version cannot be changed/);

    // put version 1 back: it becomes the draft (version 3) and nothing is live until the publish
    const restored = (await adminSend("POST", "/legal/terms/versions/1/restore", { locale: "en" })).json();
    expect(restored.drafts.en).toMatchObject({ version: 3 });
    expect(restored.drafts.en.content).toContain("Be kind");
    expect(restored.documents.en.version).toBe(2);
    expect((await adminSend("POST", "/legal/terms/versions/3/restore", { locale: "en" })).json().error.code).toBe("NOT_PUBLISHED"); // a draft is not put back
    expect((await adminSend("POST", "/legal/terms/publish", { locale: "en" })).json().documents.en.version).toBe(3);
    expect((await t.get("/public/legal/terms?locale=en")).json().content).toContain("Be kind");
  });

  it("records what each user agreed to, and asks again after a major publish (and only then)", async () => {
    const consent = (method: "GET" | "POST", payload?: unknown, cookie = customer.cookie) =>
      t.app.inject({ method, url: "/api/v1/legal/consent", ...(payload !== undefined ? { payload: payload as object } : {}), remoteAddress: nextIp(), headers: { origin: "http://app.localtest.me:3000", cookie } });
    expect((await t.get("/legal/consent")).statusCode).toBe(401);
    const first = (await consent("GET")).json();
    expect(first.mustAcceptAny).toBe(true);
    expect(first.items.find((i: { kind: string }) => i.kind === "terms")).toMatchObject({ epoch: 0, accepted: null, mustAccept: true, published: { version: 3, locale: "en" } });

    expect((await consent("POST", { kinds: [] })).statusCode).toBe(422);
    expect((await consent("POST", { kinds: ["other"] })).statusCode).toBe(422);
    const agreed = (await consent("POST", { kinds: ["terms", "privacy"], locale: "en" })).json();
    expect(agreed.mustAcceptAny).toBe(false);
    expect(agreed.items.find((i: { kind: string }) => i.kind === "terms").accepted).toMatchObject({ epoch: 0, version: 3, locale: "en" });
    expect((await consent("POST", { kinds: ["terms"] })).json().mustAcceptAny).toBe(false); // a second time changes nothing
    const rows = await t.pool.query("select * from legal_consents where user_id = $1", [customer.id]);
    expect(rows.rows).toHaveLength(2);
    await expect(t.pool.query("delete from legal_consents where user_id = $1", [customer.id])).rejects.toThrow(/append only/);
    await expect(t.pool.query("update legal_consents set version = 9 where user_id = $1", [customer.id])).rejects.toThrow(/append only/);

    // a small change: nobody has to agree again
    await adminSend("PUT", "/legal/terms", { locale: "en", content: "Terms, a typo fixed" });
    await adminSend("POST", "/legal/terms/publish", { locale: "en" });
    expect((await consent("GET")).json().mustAcceptAny).toBe(false);

    // a major one: everybody does, for that document only, and the old consent stays as the record
    await adminSend("PUT", "/legal/terms", { locale: "en", content: "Terms, new rules" });
    const major = (await adminSend("POST", "/legal/terms/publish", { locale: "en", major: true })).json();
    expect(major.epoch).toBe(1);
    expect(major.consents.agreed).toBe(0);
    const again = (await consent("GET")).json();
    expect(again.items.find((i: { kind: string }) => i.kind === "terms")).toMatchObject({ epoch: 1, mustAccept: true, accepted: { epoch: 0 } });
    expect(again.items.find((i: { kind: string }) => i.kind === "privacy").mustAccept).toBe(false);
    const done = (await consent("POST", { kinds: ["terms"] })).json();
    expect(done.mustAcceptAny).toBe(false);
    expect(done.items.find((i: { kind: string }) => i.kind === "terms").accepted).toMatchObject({ epoch: 1, version: 5 });
    expect((await t.pool.query("select * from legal_consents where user_id = $1", [customer.id])).rows).toHaveLength(3);
    expect((await adminSend("GET", "/legal/terms")).json().consents.agreed).toBeGreaterThanOrEqual(1);

    // a document that is not published cannot be agreed to
    await t.pool.query("truncate legal_documents");
    expect((await consent("POST", { kinds: ["privacy"] })).json().error.code).toBe("NOT_PUBLISHED");
  });
});
