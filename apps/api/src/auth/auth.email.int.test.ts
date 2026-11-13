import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_ATTEMPTS, retryDelayMs } from "../outbox/outbox.service";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, drain, emailFor, linkIn, signupBody, startApp, type TestApp } from "../test/helpers";

// Email verification, forgot / reset password, the outbox and the bot check, on a real PostgreSQL. This is the PRODUCTION mode: a new account must verify its email first.
const d = describe.skipIf(!TEST_DATABASE_URL);

const eventsFor = (t: TestApp, to: string) => t.pool.query<{ id: string; status: string; attempts: number; last_error: string | null; payload: unknown; available_at: Date }>(
  "select id, status, attempts, last_error, payload, available_at from outbox_events where payload::text like $1 or payload->>'template' is not null and id in (select id from outbox_events where payload @> $2::jsonb) order by created_at",
  [`%${to}%`, JSON.stringify({ template: { to } })],
);

d("email verification (production mode)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await startApp({ REQUIRE_EMAIL_VERIFICATION: "true" }); });
  afterAll(async () => { await t.close(); });

  it("writes the emails of an account in the language it signed up with, and in English when none was given", async () => {
    const ko = emailFor("koverify");
    expect((await t.post("/auth/signup", { ...signupBody("CUSTOMER", ko), locale: "ko" })).statusCode).toBe(202);
    const en = emailFor("enverify");
    await t.post("/auth/signup", signupBody("CUSTOMER", en));
    expect((await t.post("/auth/signup", { ...signupBody("CUSTOMER", emailFor("badloc")), locale: "xx" })).statusCode).toBe(422);
    await drain(t);
    expect(t.emails.sent.find((m) => m.to === ko)!.subject).toBe("이메일을 확인해 주세요");
    expect(t.emails.sent.find((m) => m.to === en)!.subject).toBe("Confirm your email");
    expect((await t.pool.query("select ui_locale from users where email = $1", [ko])).rows[0]).toEqual({ ui_locale: "ko" });

    // a reset link and the notice of a changed password are in that language too; so is the notice that the email already has an account
    await t.post("/auth/forgot-password", { email: ko });
    await t.post("/auth/signup", { ...signupBody("CUSTOMER", ko), locale: "en" });
    await drain(t);
    const mails = t.emails.sent.filter((m) => m.to === ko).map((m) => m.subject);
    expect(mails).toContain("비밀번호 재설정");
    expect(mails).toContain("이미 계정이 있습니다"); // the language of the account, not the one of the new attempt
  });

  it("signup answers 202 and never says whether the email was new; the email goes out through the outbox, and the link is not left in the database", async () => {
    const email = emailFor("verify");
    const res = await t.post("/auth/signup", signupBody("CUSTOMER", email));
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ status: "CHECK_EMAIL" });
    expect(res.headers["set-cookie"]).toBeUndefined(); // not logged in
    expect((await t.pool.query("select status from users where email = $1", [email])).rows[0]).toEqual({ status: "UNVERIFIED" });

    // queued in the same transaction as the account; nothing is sent until the worker runs
    const queued = await eventsFor(t, email);
    expect(queued.rows).toHaveLength(1);
    expect(queued.rows[0]!.status).toBe("PENDING");
    expect(t.emails.sent.filter((m) => m.to === email)).toHaveLength(0);

    await drain(t);
    const mail = t.emails.sent.find((m) => m.to === email)!;
    expect(mail.subject).toBe("Confirm your email");
    const { link, token } = linkIn(t.emails, email);
    expect(link.startsWith("http://app.localtest.me:3000/verify-email?token=")).toBe(true);

    const sent = await t.pool.query<{ status: string; payload: unknown }>("select status, payload from outbox_events where id = $1", [queued.rows[0]!.id]);
    expect(sent.rows[0]!.status).toBe("DISPATCHED");
    expect(JSON.stringify(sent.rows[0]!.payload)).not.toContain(token); // the secret link is scrubbed once sent
    const stored = await t.pool.query("select token_hash from user_tokens where user_id = (select id from users where email = $1)", [email]);
    expect(JSON.stringify(stored.rows)).not.toContain(token); // only the hash is stored
  });

  it("cannot log in before verifying; the link verifies once; then the login works", async () => {
    const email = emailFor("verify2");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    await drain(t);
    const before = await t.post("/auth/login", { email, password: PASSWORD });
    expect(before.statusCode).toBe(403);
    expect(before.json().error.code).toBe("EMAIL_NOT_VERIFIED");

    const { token } = linkIn(t.emails, email);
    expect((await t.post("/auth/verify-email", { token })).statusCode).toBe(200);
    expect((await t.post("/auth/verify-email", { token })).json().error.code).toBe("TOKEN_INVALID"); // single use
    expect((await t.post("/auth/verify-email", { token: "x".repeat(43) })).statusCode).toBe(400);
    expect((await t.pool.query("select status, email_verified_at from users where email = $1", [email])).rows[0]).toMatchObject({ status: "ACTIVE" });
    expect((await t.post("/auth/login", { email, password: PASSWORD })).statusCode).toBe(200);
  });

  it("an expired link does not verify; asking again sends a new one and the old one stops working", async () => {
    const email = emailFor("verify3");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    await drain(t);
    const first = linkIn(t.emails, email).token;
    await t.pool.query("update user_tokens set expires_at = now() - interval '1 minute' where user_id = (select id from users where email = $1)", [email]);
    expect((await t.post("/auth/verify-email", { token: first })).statusCode).toBe(400);

    expect((await t.post("/auth/resend-verification", { email })).statusCode).toBe(202);
    await drain(t);
    const second = linkIn(t.emails, email).token;
    expect(second).not.toBe(first);
    expect((await t.post("/auth/verify-email", { token: second })).statusCode).toBe(200);
  });

  it("signing up with an email that has an account looks the same (202) and warns the owner of the mailbox", async () => {
    const email = emailFor("exists");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    const again = await t.post("/auth/signup", signupBody("CUSTOMER", email));
    expect(again.statusCode).toBe(202);
    expect(again.json()).toEqual({ status: "CHECK_EMAIL" });
    await drain(t);
    expect(t.emails.sent.some((m) => m.to === email && m.subject === "You already have an account")).toBe(true);
    expect((await t.pool.query("select count(*)::int as n from users where email = $1", [email])).rows[0]).toEqual({ n: 1 });
  });

  it("resend answers 202 for an unknown email too and sends nothing", async () => {
    const email = emailFor("nobody");
    expect((await t.post("/auth/resend-verification", { email })).statusCode).toBe(202);
    await drain(t);
    expect(t.emails.sent.some((m) => m.to === email)).toBe(false);
  });
});

d("forgot and reset password", () => {
  let t: TestApp;
  beforeAll(async () => { t = await startApp({ REQUIRE_EMAIL_VERIFICATION: "false" }); });
  afterAll(async () => { await t.close(); });

  it("an unknown email gets the same 202 and no email; a known one gets a link that works once", async () => {
    const ghost = emailFor("ghost");
    expect((await t.post("/auth/forgot-password", { email: ghost })).statusCode).toBe(202);
    const email = emailFor("forgot");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    expect((await t.post("/auth/forgot-password", { email: email.toUpperCase() })).json()).toEqual({ status: "ACCEPTED" });
    await drain(t);
    expect(t.emails.sent.some((m) => m.to === ghost)).toBe(false);
    const mail = t.emails.sent.filter((m) => m.to === email).at(-1)!;
    expect(mail.subject).toBe("Reset your password");
    expect(mail.text).toContain("24 hours"); // RESET_LINK_HOURS
  });

  it("a reset sets the new password, logs the account out everywhere, tells the owner, and the link cannot be used twice", async () => {
    const email = emailFor("reset");
    const session = cookieOf(await t.post("/auth/signup", signupBody("CUSTOMER", email)));
    expect((await t.get("/auth/me", { cookie: session })).statusCode).toBe(200);
    await t.post("/auth/forgot-password", { email });
    await drain(t);
    const { token } = linkIn(t.emails, email);

    const weak = await t.post("/auth/reset-password", { token, password: "short", confirmPassword: "short" });
    expect(weak.statusCode).toBe(422);
    expect((await t.post("/auth/reset-password", { token, password: "Another-pass-2027", confirmPassword: "different-pass-2027" })).statusCode).toBe(422);
    const ok = await t.post("/auth/reset-password", { token, password: "Another-pass-2027", confirmPassword: "Another-pass-2027" });
    expect(ok.statusCode).toBe(200);

    expect((await t.get("/auth/me", { cookie: session })).statusCode).toBe(401); // the old session is gone
    expect((await t.post("/auth/login", { email, password: PASSWORD })).statusCode).toBe(401); // the old password no longer works
    expect((await t.post("/auth/login", { email, password: "Another-pass-2027" })).statusCode).toBe(200);
    const again = await t.post("/auth/reset-password", { token, password: "Third-pass-2028-x", confirmPassword: "Third-pass-2028-x" });
    expect(again.statusCode).toBe(400);
    expect(again.json().error.code).toBe("TOKEN_INVALID");

    await drain(t);
    expect(t.emails.sent.some((m) => m.to === email && m.subject === "Your password was changed")).toBe(true);
  });

  it("an expired reset link does not work", async () => {
    const email = emailFor("resetexp");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    await t.post("/auth/forgot-password", { email });
    await drain(t);
    const { token } = linkIn(t.emails, email);
    await t.pool.query("update user_tokens set expires_at = now() - interval '1 second' where user_id = (select id from users where email = $1) and type = 'PASSWORD_RESET'", [email]);
    expect((await t.post("/auth/reset-password", { token, password: "Another-pass-2027", confirmPassword: "Another-pass-2027" })).statusCode).toBe(400);
  });

  it("limits how often one email can be asked for (3 an hour), whoever asks", async () => {
    const email = emailFor("limit");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    for (let i = 0; i < 3; i++) expect((await t.post("/auth/forgot-password", { email }, { from: `10.9.9.${i + 1}` })).statusCode).toBe(202);
    const fourth = await t.post("/auth/forgot-password", { email }, { from: "10.9.9.9" });
    expect(fourth.statusCode).toBe(429);
    expect(fourth.json().error.details.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("the reset is audited without any secret", async () => {
    const email = emailFor("auditreset");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    await t.post("/auth/forgot-password", { email });
    await drain(t);
    const { token } = linkIn(t.emails, email);
    await t.post("/auth/reset-password", { token, password: "Another-pass-2027", confirmPassword: "Another-pass-2027" });
    const { rows } = await t.pool.query<{ action: string; before: unknown; after: unknown }>("select action, before, after from audit_logs where actor_user_id = (select id from users where email = $1) order by created_at", [email]);
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["auth.signup", "auth.password_reset_requested", "auth.password_reset"]));
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(rows)).not.toContain("Another-pass");
  });
});

d("the outbox: retries and the end of retries", () => {
  let t: TestApp;
  beforeAll(async () => { t = await startApp({ REQUIRE_EMAIL_VERIFICATION: "true" }); });
  afterAll(async () => { await t.close(); });

  it("backs off after a failure, tries again later, and sends when the provider works", async () => {
    const email = emailFor("retry");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    t.emails.failWith = new Error("SMTP is down");
    await drain(t);
    const row = (await eventsFor(t, email)).rows[0]!;
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, last_error: "SMTP is down" });
    expect(row.available_at.getTime()).toBeGreaterThan(Date.now()); // not tried again at once

    t.emails.failWith = null;
    await drain(t, new Date()); // too early: its time has not come
    expect(t.emails.sent.some((m) => m.to === email)).toBe(false);
    await drain(t, new Date(Date.now() + retryDelayMs(1) + 1_000));
    expect(t.emails.sent.some((m) => m.to === email)).toBe(true);
    // a sent event loses its payload (the secret link), so it is found by its id, not by the address
    const done = await t.pool.query("select status, attempts, last_error from outbox_events where id = $1", [row.id]);
    expect(done.rows[0]).toMatchObject({ status: "DISPATCHED", attempts: 2, last_error: null });
  });

  it("gives up after five attempts: the event is FAILED and is not tried again", async () => {
    const email = emailFor("giveup");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    t.emails.failWith = new Error("mailbox unavailable");
    let when = Date.now();
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await drain(t, new Date(when));
      when += 2 * 60 * 60_000;
    }
    expect((await eventsFor(t, email)).rows[0]).toMatchObject({ status: "FAILED", attempts: MAX_ATTEMPTS });
    t.emails.failWith = null;
    await drain(t, new Date(when + 86_400_000));
    expect(t.emails.sent.some((m) => m.to === email)).toBe(false);
  });
});

d("the bot check (Turnstile)", () => {
  let t: TestApp;
  beforeAll(async () => { t = await startApp({ TURNSTILE_SECRET_KEY: "test-secret-not-real" }); });
  afterAll(async () => { await t.close(); });

  it("refuses a signup and a password reset request without a Turnstile token, and does not create the account", async () => {
    const email = emailFor("bot");
    const res = await t.post("/auth/signup", signupBody("CUSTOMER", email));
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("BOT_CHECK_FAILED");
    expect((await t.pool.query("select 1 from users where email = $1", [email])).rowCount).toBe(0);
    expect((await t.post("/auth/forgot-password", { email })).statusCode).toBe(400);
  });
});
