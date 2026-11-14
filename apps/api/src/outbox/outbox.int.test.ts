import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, drain, emailFor, signupBody, startApp, type TestApp } from "../test/helpers";

const d = describe.skipIf(!TEST_DATABASE_URL);

d("the outbox sends an email without holding a transaction, and never twice", () => {
  let t: TestApp;
  beforeAll(async () => { t = await startApp(); await drain(t); });
  afterAll(async () => { await t.close(); });

  it("does not keep the row locked while the mail server is slow, and two workers that run at once send it once", async () => {
    const email = emailFor("outbox");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    await drain(t); // (the welcome and verification mails of the signup)
    await t.post("/auth/forgot-password", { email });

    // a mail server that takes a moment: while it "sends", nobody may hold a lock on the row of the email
    const send = t.emails.send.bind(t.emails);
    let lockedWhileSending: boolean | null = null;
    t.emails.send = async (mail) => {
      if (mail.to === email && lockedWhileSending === null) {
        const client = await t.pool.connect();
        try {
          await client.query("begin");
          // NOWAIT fails at once if another transaction holds the row: that is what a transaction held across the send would do
          await client.query("select id from outbox_events where recipient = $1 and status = 'PENDING' for update nowait", [email]).then(() => { lockedWhileSending = false; }, () => { lockedWhileSending = true; });
        } finally {
          await client.query("rollback").catch(() => undefined);
          client.release();
        }
      }
      await new Promise((r) => setTimeout(r, 150));
      return send(mail);
    };
    const before = t.emails.sent.filter((m) => m.to === email).length;
    try {
      await Promise.all([t.outbox.dispatchPending(50), t.outbox.dispatchPending(50), t.outbox.dispatchPending(50)]);
      await drain(t);
    } finally {
      t.emails.send = send;
    }
    expect(lockedWhileSending).toBe(false);
    expect(t.emails.sent.filter((m) => m.to === email).length - before).toBe(1);
    const rows = await t.pool.query<{ status: string; attempts: number }>("select status, attempts from outbox_events where recipient = $1 order by created_at desc limit 1", [email]);
    expect(rows.rows[0]).toMatchObject({ status: "DISPATCHED", attempts: 1 });
  });

  it("a failed send is tried again later, and the claim does not make it wait for the whole claim time", async () => {
    const email = emailFor("outbox-retry");
    await t.post("/auth/signup", signupBody("CUSTOMER", email));
    await drain(t);
    await t.post("/auth/forgot-password", { email });
    t.emails.failWith = new Error("the mail server is down");
    try {
      await drain(t);
    } finally {
      t.emails.failWith = null;
    }
    const [row] = (await t.pool.query<{ status: string; attempts: number; available_at: Date }>("select status, attempts, available_at from outbox_events where recipient = $1 order by created_at desc limit 1", [email])).rows;
    expect(row).toMatchObject({ status: "PENDING", attempts: 1 });
    // due again after the delay of the first retry (one minute), not after the claim of five minutes
    expect(row!.available_at.getTime() - Date.now()).toBeLessThan(2 * 60_000);
  });
});
