import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { MaintenanceService } from "../jobs/maintenance";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, drain, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The system emails of the platform administrator on a real PostgreSQL (FR-ADM-22): the list of what was sent, a new try for a failure, the notices an administrator writes, and what is kept for a time.
const d = describe.skipIf(!TEST_DATABASE_URL);

let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.4`;

d("system emails", () => {
  let t: TestApp;
  let admin: string;
  let owner: { cookie: string };
  let customer: { id: string; email: string };

  const send = (method: "GET" | "POST" | "PUT", url: string, payload?: unknown, cookie = admin) =>
    t.app.inject({ method, url: `/api/v1/admin${url}`, ...(payload !== undefined ? { payload: payload as object } : {}), remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie } });
  const list = async (query: string) => (await send("GET", `/directory/emails?${query}`)).json();
  /** Tries every waiting email again and again, far enough in the future that no back-off is still running. */
  async function drainAll(rounds = 7): Promise<void> {
    for (let i = 1; i <= rounds; i++) await drain(t, new Date(Date.now() + i * 3 * 3_600_000));
  }

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("mailroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("mailowner"), `Shop ${unique("m")}`), { from: nextIp() });
    owner = { cookie: cookieOf(res) };
    const ce = emailFor("mailcust");
    customer = { id: (await t.post("/auth/signup", signupBody("CUSTOMER", ce), { from: nextIp() })).json().id, email: ce };
  });
  afterAll(async () => { await t.close(); });

  it("lists what was sent without its content, with the kind and the result, and keeps the content of a secret email out of the table", async () => {
    expect((await send("POST", `/users/${customer.id}/reset-password`, {})).statusCode).toBe(202);
    await drain(t);
    const found = (await list(`q=${encodeURIComponent(customer.email)}`)).items;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ to: customer.email, type: "password-reset", status: "SENT", attempts: 1, lastError: null });
    expect(found[0].subject).toBeTruthy();
    expect((await list(`q=${encodeURIComponent(customer.email)}&type=password-reset&status=SENT`)).items).toHaveLength(1);
    expect((await list(`q=${encodeURIComponent(customer.email)}&type=verify-email`)).items).toEqual([]);
    expect((await list(`q=${encodeURIComponent(customer.email)}&status=FAILED`)).items).toEqual([]);
    expect((await send("GET", "/directory/emails?status=NOPE")).statusCode).toBe(422);
    expect((await send("GET", "/directory/emails", undefined, owner.cookie)).statusCode).toBe(403);
    expect((await t.get("/admin/directory/emails")).statusCode).toBe(401);

    // the content of an email of the system is never shown: it holds a link with a secret, and it is not even kept
    const detail = (await send("GET", `/emails/${found[0].id}`)).json();
    expect(detail).toMatchObject({ id: found[0].id, to: customer.email, type: "password-reset", status: "SENT", content: null });
    const row = (await t.pool.query<{ payload: string }>("select payload::text as payload from outbox_events where id = $1", [found[0].id])).rows[0]!;
    expect(row.payload).not.toMatch(/token|reset-password|link/i);
    expect((await send("GET", `/emails/${randomUUID()}`)).statusCode).toBe(404);
  });

  it("tries a failed email again, once it failed, and tells the one that arrived that there is nothing to resend", async () => {
    const to = `fail-${unique("f")}@example.test`;
    t.emails.failWith = new Error("SMTP is down");
    expect((await send("POST", "/emails", { audience: "ADDRESS", address: to, subject: "Planned maintenance", body: "We will be offline on Sunday." })).json()).toEqual({ queued: 1 });
    await drainAll();
    t.emails.failWith = null;
    const failed = (await list(`q=${encodeURIComponent(to)}`)).items[0];
    expect(failed).toMatchObject({ to, status: "FAILED", attempts: 5, lastError: "SMTP is down", type: "admin-message" });

    expect((await send("POST", `/emails/${failed.id}/resend`, {}, owner.cookie)).statusCode).toBe(403);
    expect((await send("POST", `/emails/${failed.id}/resend`, {})).json()).toEqual({ id: failed.id, status: "PENDING" });
    expect((await list(`q=${encodeURIComponent(to)}`)).items[0]).toMatchObject({ status: "PENDING", attempts: 0, lastError: null });
    await drain(t);
    expect((await list(`q=${encodeURIComponent(to)}`)).items[0]).toMatchObject({ status: "SENT", attempts: 1 });
    expect(t.emails.sent.some((m) => m.to === to && m.subject === "Planned maintenance")).toBe(true);
    expect((await send("POST", `/emails/${failed.id}/resend`, {})).json().error.code).toBe("NOT_FAILED"); // it arrived
    expect((await send("POST", `/emails/${randomUUID()}/resend`, {})).statusCode).toBe(404);
    expect((await t.pool.query("select action from audit_logs where entity_id = $1 and action = 'email.resend'", [failed.id])).rowCount).toBe(1);
  });

  it("sends a notice the administrator wrote: plain text, one separate email for each person, the content readable again, and never in the audit log", async () => {
    const to = emailFor("notice");
    const body = "Hello,\n\nThe booking pages will be offline <b>tonight</b>.\n\n<script>alert(1)</script>";
    expect((await send("POST", "/emails", { audience: "ADDRESS", address: ` ${to.toUpperCase()} `, subject: "  Scheduled maintenance  ", body })).statusCode).toBe(201);
    await drain(t);
    const mail = t.emails.sent.find((m) => m.to === to);
    expect(mail).toBeDefined();
    expect(mail!.subject).toBe("Scheduled maintenance");
    expect(mail!.text).toContain("<b>tonight</b>"); // plain text: shown as it was typed
    expect(mail!.html).not.toContain("<script>"); // and never read as HTML
    expect(mail!.html).toContain("&lt;b&gt;tonight&lt;/b&gt;");
    const item = (await list(`q=${encodeURIComponent(to)}`)).items[0];
    expect(item).toMatchObject({ type: "admin-message", status: "SENT", subject: "Scheduled maintenance" });
    expect((await send("GET", `/emails/${item.id}`)).json().content).toEqual({ subject: "Scheduled maintenance", body }); // only what an administrator wrote can be read again
    const log = await t.pool.query<{ after: { audience: string; recipients: number; subject: string }; text: string }>("select after, after::text as text from audit_logs where action = 'email.send' and entity_id = 'ADDRESS' order by created_at desc limit 1");
    expect(log.rows[0]!.after).toEqual({ audience: "ADDRESS", recipients: 1, subject: "Scheduled maintenance" });
    expect(log.rows[0]!.text).not.toContain("tonight");

    const fields = async (payload: Record<string, unknown>) => (await send("POST", "/emails", payload)).json().error?.details?.fields;
    expect(await fields({ audience: "ADDRESS", subject: "x", body: "y" })).toEqual({ address: "required" });
    expect(await fields({ audience: "ADDRESS", address: "nope", subject: "x", body: "y" })).toEqual({ address: "invalid" });
    expect(await fields({ audience: "ADDRESS", address: to, subject: "  ", body: "y" })).toEqual({ subject: "required" });
    expect(await fields({ audience: "ADDRESS", address: to, subject: "a\nBcc: x@example.test", body: "y" })).toEqual({ subject: "invalid" }); // no header injection
    expect(await fields({ audience: "ADDRESS", address: to, subject: "s".repeat(201), body: "y" })).toEqual({ subject: "tooLong" });
    expect(await fields({ audience: "ADDRESS", address: to, subject: "x", body: "   " })).toEqual({ body: "required" });
    expect(await fields({ audience: "ADDRESS", address: to, subject: "x", body: "b".repeat(10_001) })).toEqual({ body: "tooLong" });
    expect(await fields({ audience: "EVERYONE", subject: "x", body: "y" })).toEqual({ audience: "invalid" });
    expect((await send("POST", "/emails", { audience: "ADDRESS", address: to, subject: "x", body: "y" }, owner.cookie)).statusCode).toBe(403);

    // everybody of one kind: never more than 500 at once, and one email for each (nobody sees the others)
    const owners = (await t.pool.query<{ n: number }>("select count(distinct u.id)::int as n from users u join organization_members m on m.user_id = u.id where u.status = 'ACTIVE' and u.platform_role is null")).rows[0]!.n;
    const all = await send("POST", "/emails", { audience: "SHOP_OWNERS", subject: "Notice for shops", body: "Hello shops" });
    if (owners > 500) expect(all.json().error.details.fields).toEqual({ audience: "tooMany" });
    else expect(all.json()).toEqual({ queued: owners });
    await drain(t);
  });

  it("removes what is kept for a time only: the emails after 90 days and the Contact messages after 12 months", async () => {
    const old = `old-${unique("o")}@example.test`;
    const recent = `new-${unique("o")}@example.test`;
    for (const [to, days] of [[old, 100], [recent, 10]] as const) {
      await t.pool.query("insert into outbox_events (type, payload, status, recipient, template, subject, created_at) values ('EMAIL', '{\"redacted\":true}', 'DISPATCHED', $1, 'verify-email', 'Hello', now() - $2::numeric * interval '1 day')", [to, days]);
    }
    await t.pool.query("insert into contact_messages (name, email, topic, message, created_at) values ('Old', $1, 'general', 'An old message that is over a year old.', now() - interval '13 months'), ('Recent', $2, 'general', 'A recent message from this week here.', now() - interval '2 days')", [old, recent]);
    const removed = await t.app.get(MaintenanceService, { strict: false }).purgeExpired();
    expect(removed.emails).toBeGreaterThanOrEqual(1);
    expect(removed.messages).toBeGreaterThanOrEqual(1);
    const left = async (table: "outbox_events" | "contact_messages", column: string, value: string) => (await t.pool.query(`select 1 from ${table} where ${column} = $1`, [value])).rowCount;
    expect([await left("outbox_events", "recipient", old), await left("outbox_events", "recipient", recent)]).toEqual([0, 1]);
    expect([await left("contact_messages", "email", old), await left("contact_messages", "email", recent)]).toEqual([0, 1]);

    // the administrator sets how long they are kept: 1 month and 7 days now
    const aging = `age-${unique("o")}@example.test`;
    await t.pool.query("insert into outbox_events (type, payload, status, recipient, template, subject, created_at) values ('EMAIL', '{\"redacted\":true}', 'DISPATCHED', $1, 'verify-email', 'Hello', now() - interval '20 days')", [aging]);
    await t.pool.query("insert into contact_messages (name, email, topic, message, created_at) values ('Aging', $1, 'general', 'A message that is about two months old now.', now() - interval '2 months')", [aging]);
    // the administrator sets how long they are kept: 1 month and 7 days
    expect((await send("PUT", "/settings", { resetLinkHours: 24, contactPerHour: 5, contactRetentionMonths: 1, emailRetentionDays: 7 }, owner.cookie)).statusCode).toBe(403);
    expect((await send("PUT", "/settings", { resetLinkHours: 24, contactPerHour: 5, contactRetentionMonths: 1, emailRetentionDays: 7 })).json()).toMatchObject({ contactRetentionMonths: 1, emailRetentionDays: 7 });
    try {
      await t.app.get(MaintenanceService, { strict: false }).purgeExpired();
      expect([await left("outbox_events", "recipient", aging), await left("contact_messages", "email", aging)]).toEqual([0, 0]); // older than the new limits
      expect(await left("outbox_events", "recipient", recent)).toBe(0); // 10 days: it stayed under the 90 days above, not under 7
      expect(await left("contact_messages", "email", recent)).toBe(1); // 2 days: still under a month
    } finally {
      await send("PUT", "/settings", { resetLinkHours: 24, contactPerHour: 5, contactRetentionMonths: 12, emailRetentionDays: 90 });
    }
  });
});
