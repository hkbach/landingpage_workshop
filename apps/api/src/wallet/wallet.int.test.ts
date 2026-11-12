import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, type TestApp } from "../test/helpers";

// The wallet of a customer and the withdrawal invoices on a real PostgreSQL (FR-CUST-04, FR-ADM-19, D6, D12): what can be asked, the limits, the lock against asking twice, and who may process.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Customer { cookie: string; id: string; email: string }

d("wallet and withdrawals of a customer", () => {
  let t: TestApp;
  let admin: string;
  let emma: Customer;
  let other: Customer;

  const makeCustomer = async (label: string): Promise<Customer> => {
    const email = emailFor(label);
    const res = await t.post("/auth/signup", signupBody("CUSTOMER", email));
    return { cookie: cookieOf(res), id: res.json().id as string, email };
  };
  /** What the affiliate and referral programs will write when a fee or a bonus is earned (they are not in the backend yet). */
  const credit = (c: Customer, source: "AFFILIATE" | "REFERRAL", currency: string, amount: number) =>
    t.pool.query("insert into wallet_credits (user_id, source, currency, amount, note) values ($1, $2, $3, $4, 'test')", [c.id, source, currency, amount]);
  const wallet = (c: Customer, query = "", as = c) => t.get(`/customer/${c.id}/wallet${query}`, { cookie: as.cookie });
  const ask = (c: Customer, body: unknown, as = c) => t.post(`/customer/${c.id}/withdrawals`, body, { cookie: as.cookie });
  const adminGet = (url: string) => t.get(`/admin${url}`, { cookie: admin });
  const process = (id: string, body: unknown, cookie = admin) => t.post(`/admin/withdrawals/${id}`, body, { cookie });
  const putLimits = (body: unknown, cookie = admin) => t.app.inject({ method: "PUT", url: "/api/v1/admin/settings/withdrawal-limits", payload: body as object, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie } });

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("walroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    emma = await makeCustomer("emma");
    other = await makeCustomer("other");
    await credit(emma, "AFFILIATE", "VND", 500_000);
    await credit(emma, "AFFILIATE", "VND", 100_000);
    await credit(emma, "REFERRAL", "VND", 80_000);
    await credit(emma, "AFFILIATE", "USD", 2_000);
  });
  afterAll(async () => { await t.close(); });

  it("shows the wallet of the account in the session for each source and currency, and nobody else's", async () => {
    const res = (await wallet(emma)).json();
    expect(res.source).toBeNull();
    expect(res.balances).toEqual([
      { source: "AFFILIATE", currency: "USD", earned: 2_000, pending: 0, withdrawn: 0, available: 2_000, limits: { minAmount: 0, maxAmount: 0 } },
      { source: "AFFILIATE", currency: "VND", earned: 600_000, pending: 0, withdrawn: 0, available: 600_000, limits: { minAmount: 0, maxAmount: 0 } },
      { source: "REFERRAL", currency: "VND", earned: 80_000, pending: 0, withdrawn: 0, available: 80_000, limits: { minAmount: 0, maxAmount: 0 } },
    ]);
    expect(res.invoices).toEqual([]);
    expect((await wallet(emma, "?source=REFERRAL")).json().balances).toHaveLength(1);
    expect((await wallet(emma, "?source=OTHER")).statusCode).toBe(422);
    expect((await wallet(other)).json().balances).toEqual([]); // another account has its own, empty wallet
    // Another account's id in the path is a 404 (not a 403, not an empty answer), and a visitor is 401.
    expect((await wallet(emma, "", other)).statusCode).toBe(404);
    expect((await ask(emma, { source: "AFFILIATE", currency: "VND", amount: 1000 }, other)).statusCode).toBe(404);
    expect((await t.get(`/customer/${emma.id}/wallet`)).statusCode).toBe(401);
    expect((await t.get(`/customer/${randomUUID()}/wallet`, { cookie: emma.cookie })).statusCode).toBe(404);
  });

  it("makes an invoice WD-xxxx for what can be asked, refuses more, and keeps the sources and currencies apart", async () => {
    const fields = async (body: unknown) => (await ask(emma, body)).json().error?.details?.fields;
    expect(await fields({ source: "AFFILIATE", currency: "VND", amount: 600_001 })).toEqual({ amount: "exceeds" });
    expect(await fields({ source: "REFERRAL", currency: "VND", amount: 80_001 })).toEqual({ amount: "exceeds" }); // the affiliate money is not the referral money
    expect(await fields({ source: "AFFILIATE", currency: "EUR", amount: 1 })).toEqual({ amount: "exceeds" }); // no wallet in that currency
    expect(await fields({ source: "AFFILIATE", currency: "VND", amount: 0 })).toEqual({ amount: "invalid" });
    expect(await fields({ source: "AFFILIATE", currency: "VND", amount: -5 })).toEqual({ amount: "invalid" });
    expect(await fields({ source: "AFFILIATE", currency: "VND", amount: 10.5 })).toEqual({ amount: "invalid" });
    expect(await fields({ source: "AFFILIATE", currency: "VND", amount: "100" })).toEqual({ amount: "invalid" });
    expect(await fields({ source: "AFFILIATE", currency: "VND" })).toEqual({ amount: "required" });
    expect(await fields({ source: "AFFILIATE", amount: 5 })).toEqual({ currency: "required" });
    expect(await fields({ source: "NOPE", currency: "VND", amount: 5 })).toMatchObject({ source: "invalid" });
    expect((await wallet(emma)).json().invoices).toEqual([]); // nothing was made by the refused calls

    const res = await ask(emma, { source: "AFFILIATE", currency: "vnd", amount: 150_000 });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ source: "AFFILIATE", currency: "VND", amount: 150_000, status: "PENDING", reason: null, processedAt: null });
    expect(res.json().number).toMatch(/^WD-\d{4,}$/);
    const after = (await wallet(emma, "?source=AFFILIATE")).json();
    expect(after.balances.find((b: { currency: string }) => b.currency === "VND")).toMatchObject({ earned: 600_000, pending: 150_000, withdrawn: 0, available: 450_000 });
    expect(after.invoices).toHaveLength(1);
    expect((await wallet(emma, "?source=REFERRAL")).json().invoices).toEqual([]);
    const log = await t.pool.query("select actor_user_id, organization_id, after from audit_logs where entity_id = $1 and action = 'withdrawal.request'", [res.json().id]);
    expect(log.rows).toHaveLength(1);
    expect(log.rows[0]).toMatchObject({ actor_user_id: emma.id, organization_id: null, after: { amount: 150_000 } });
  });

  it("never lets requests made at the same time take out more than the wallet holds", async () => {
    const c = await makeCustomer("race");
    await credit(c, "REFERRAL", "VND", 350_000);
    const results = await Promise.all(Array.from({ length: 8 }, () => ask(c, { source: "REFERRAL", currency: "VND", amount: 100_000 })));
    expect(results.filter((r) => r.statusCode === 201)).toHaveLength(3);
    expect(results.filter((r) => r.statusCode === 422)).toHaveLength(5);
    const b = (await wallet(c)).json().balances[0];
    expect(b).toMatchObject({ pending: 300_000, available: 50_000 });
    const numbers = (await wallet(c)).json().invoices.map((i: { number: string }) => i.number);
    expect(new Set(numbers).size).toBe(3); // three different numbers
  });

  it("applies the limits of a currency (0 = none), kept by the administrator only", async () => {
    const c = await makeCustomer("limits");
    await credit(c, "AFFILIATE", "ZZA", 1_000_000);
    expect((await putLimits({ currency: "ZZA", minAmount: 1, maxAmount: 2 }, c.cookie)).statusCode).toBe(403);
    expect((await t.get("/admin/settings/withdrawal-limits", { cookie: c.cookie })).statusCode).toBe(403);
    expect((await putLimits({ currency: "ZZA", minAmount: 100, maxAmount: 50 })).json().error.details.fields).toEqual({ maxAmount: "belowMin" });
    expect((await putLimits({ currency: "ZZA", minAmount: -1, maxAmount: 0 })).statusCode).toBe(422);
    expect((await putLimits({ currency: "zz", minAmount: 0, maxAmount: 0 })).statusCode).toBe(422);
    try {
      expect((await putLimits({ currency: "zza", minAmount: 50_000, maxAmount: 200_000 })).json()).toEqual({ currency: "ZZA", minAmount: 50_000, maxAmount: 200_000 });
      expect((await adminGet("/settings/withdrawal-limits")).json().items.find((i: { currency: string }) => i.currency === "ZZA")).toMatchObject({ minAmount: 50_000, maxAmount: 200_000 });
      expect((await wallet(c)).json().balances[0].limits).toEqual({ minAmount: 50_000, maxAmount: 200_000 }); // the customer sees them
      const fields = async (amount: number) => (await ask(c, { source: "AFFILIATE", currency: "ZZA", amount })).json().error?.details?.fields;
      expect(await fields(49_999)).toEqual({ amount: "belowMin" });
      expect(await fields(200_001)).toEqual({ amount: "aboveMax" });
      expect((await ask(c, { source: "AFFILIATE", currency: "ZZA", amount: 50_000 })).statusCode).toBe(201);
      expect((await ask(c, { source: "AFFILIATE", currency: "ZZA", amount: 200_000 })).statusCode).toBe(201);
      expect((await t.pool.query("select 1 from audit_logs where entity_id = 'ZZA' and action = 'platform.settings_update'")).rowCount).toBeGreaterThanOrEqual(1);
    } finally {
      await putLimits({ currency: "ZZA", minAmount: 0, maxAmount: 0 });
    }
  });

  it("lets the administrator pay or reject an invoice once, the customer sees the reason and a rejected one gives its money back", async () => {
    const c = await makeCustomer("proc");
    await credit(c, "AFFILIATE", "VND", 400_000);
    const a = (await ask(c, { source: "AFFILIATE", currency: "VND", amount: 100_000 })).json();
    const b = (await ask(c, { source: "AFFILIATE", currency: "VND", amount: 200_000 })).json();

    for (const url of [`/admin/withdrawals/${a.id}`]) {
      expect((await t.post(url, { action: "pay" })).statusCode).toBe(401);
      expect((await t.post(url, { action: "pay" }, { cookie: c.cookie })).statusCode).toBe(403); // the customer cannot pay his own invoice
    }
    expect((await t.get("/admin/directory/withdrawals", { cookie: c.cookie })).statusCode).toBe(403);
    expect((await process(a.id, { action: "reject" })).json().error.details.fields).toEqual({ reason: "required" });
    expect((await process(a.id, { action: "reject", reason: "   " })).json().error.details.fields).toEqual({ reason: "required" });
    expect((await process(a.id, { action: "maybe" })).statusCode).toBe(422);
    expect((await process(randomUUID(), { action: "pay" })).statusCode).toBe(404);

    const paid = await process(a.id, { action: "pay" });
    expect(paid.statusCode).toBe(200);
    expect(paid.json()).toMatchObject({ status: "PAID", reason: null });
    expect(paid.json().processedAt).not.toBeNull();
    const again = await process(a.id, { action: "reject", reason: "changed my mind" });
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toMatchObject({ code: "NOT_PENDING" });

    const rejected = await process(b.id, { action: "reject", reason: "  Bank details do not match  " });
    expect(rejected.json()).toMatchObject({ status: "REJECTED", reason: "Bank details do not match" });
    const mine = (await wallet(c)).json();
    expect(mine.balances[0]).toMatchObject({ earned: 400_000, pending: 0, withdrawn: 100_000, available: 300_000 }); // the rejected 200 000 is back
    expect(mine.invoices.find((i: { id: string }) => i.id === b.id)).toMatchObject({ status: "REJECTED", reason: "Bank details do not match" });
    const log = await t.pool.query<{ action: string; actor_user_id: string }>("select action, actor_user_id from audit_logs where entity_id = any($1) and action like 'withdrawal.%' order by action", [[a.id, b.id]]);
    expect(log.rows.map((r) => r.action).sort()).toEqual(["withdrawal.pay", "withdrawal.reject", "withdrawal.request", "withdrawal.request"]);

    // Two administrators on the same invoice: one wins, the other is told it was processed.
    const race = (await ask(c, { source: "AFFILIATE", currency: "VND", amount: 50_000 })).json();
    const both = await Promise.all([process(race.id, { action: "pay" }), process(race.id, { action: "reject", reason: "x" })]);
    expect(both.map((r) => r.statusCode).sort()).toEqual([200, 409]);
  });

  it("lists the invoices with the waiting ones first, filters and searches them, and totals them", async () => {
    const c = await makeCustomer("listing");
    await credit(c, "REFERRAL", "VND", 300_000);
    const first = (await ask(c, { source: "REFERRAL", currency: "VND", amount: 10_000 })).json();
    const second = (await ask(c, { source: "REFERRAL", currency: "VND", amount: 20_000 })).json();
    await process(second.id, { action: "pay" });
    const third = (await ask(c, { source: "REFERRAL", currency: "VND", amount: 30_000 })).json();

    const list = (await adminGet(`/directory/withdrawals?q=${encodeURIComponent(c.email)}`)).json();
    expect(list.items.map((i: { id: string }) => i.id)).toEqual([third.id, first.id, second.id]); // waiting first (newest first), then the paid one
    expect(list.items[0].customer).toEqual({ id: c.id, email: c.email, fullName: expect.any(String) });
    expect(list.totals.pending.find((x: { currency: string }) => x.currency === "VND").amount).toBeGreaterThanOrEqual(40_000);
    expect(list.totals.paid.find((x: { currency: string }) => x.currency === "VND").amount).toBeGreaterThanOrEqual(20_000);
    expect(list.totals.rejectedCount).toBeGreaterThanOrEqual(1);
    expect((await adminGet(`/directory/withdrawals?q=${first.number}`)).json().items.map((i: { id: string }) => i.id)).toEqual([first.id]);
    expect((await adminGet(`/directory/withdrawals?q=${encodeURIComponent(c.email)}&status=PAID`)).json().items).toHaveLength(1);
    expect((await adminGet(`/directory/withdrawals?q=${encodeURIComponent(c.email)}&source=AFFILIATE`)).json().items).toEqual([]);
    const today = new Date().toISOString().slice(0, 10);
    expect((await adminGet(`/directory/withdrawals?q=${encodeURIComponent(c.email)}&from=${today}&to=${today}`)).json().items).toHaveLength(3);
    expect((await adminGet(`/directory/withdrawals?q=${encodeURIComponent(c.email)}&from=2000-01-01&to=2000-01-02`)).json().items).toEqual([]);
    const p1 = (await adminGet(`/directory/withdrawals?q=${encodeURIComponent(c.email)}&limit=2`)).json();
    expect(p1.items).toHaveLength(2);
    const p2 = (await adminGet(`/directory/withdrawals?q=${encodeURIComponent(c.email)}&limit=2&cursor=${p1.nextCursor}`)).json();
    expect(p2.items.map((i: { id: string }) => i.id)).toEqual([second.id]);
    expect(p2.nextCursor).toBeNull();
  });

  it("never edits what was earned and never changes a processed invoice, whoever asks", async () => {
    await expect(t.pool.query("update wallet_credits set amount = amount + 1")).rejects.toThrow(/append only/);
    await expect(t.pool.query("delete from wallet_credits")).rejects.toThrow(/append only/);
    const processed = (await t.pool.query<{ id: string }>("select id from withdrawals where status <> 'PENDING' limit 1")).rows[0]!;
    await expect(t.pool.query("update withdrawals set status = 'PENDING', processed_at = null where id = $1", [processed.id])).rejects.toThrow(/final/);
    await expect(t.pool.query("update withdrawals set amount = 1 where id = $1", [processed.id])).rejects.toThrow(/cannot be changed/);
    await expect(t.pool.query("delete from withdrawals where id = $1", [processed.id])).rejects.toThrow(/cannot be deleted/);
  });
});
