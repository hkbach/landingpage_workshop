import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { MaintenanceService } from "../jobs/maintenance";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// Income, fees and the closing of the months on a real PostgreSQL (FR-PAY-02, FR-ADM-16/17/24, D10, D11): the numbers are worked out by hand here, so a change of the rule shows.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; workshopId: string; sessionId: string }
let counter = 0;

d("income, fees and closing of the months", () => {
  let t: TestApp;
  let admin: string;
  let a: Shop;
  let b: Shop;

  async function makeShop(label: string): Promise<Shop> {
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
    const cookie = cookieOf(res);
    const orgId = res.json().organization.id as string;
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const w = await t.post("/workshops", { title: { en: `Fin ${unique("w")}` }, durationMinutes: 90, priceAmount: 200_000, defaultCapacity: 40, maxPerBooking: 6, categories: ["COOKING"] }, { cookie });
    const workshopId = w.json().id as string;
    await t.post(`/workshops/${workshopId}/status`, { status: "ACTIVE" }, { cookie });
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [orgId])).rows[0]!.n;
    const s = await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code)
       select $1, $2, s, s, s + interval '90 minutes', 40, 'RUNNING', $3 from (select now() + interval '5 days' as s) x returning id`,
      [orgId, workshopId, `SES-${String(seq).padStart(4, "0")}`],
    );
    return { cookie, orgId, workshopId, sessionId: s.rows[0]!.id };
  }

  /** A booking made by the shop through the API (200 000 a guest, no discount). */
  async function book(shop: Shop, quantity = 2): Promise<string> {
    const res = await t.post("/bookings", { sessionId: shop.sessionId, quantity, source: "WALK_IN", fullName: "Walk In" }, { cookie: shop.cookie, headers: { "idempotency-key": `fin-${unique("k")}-${counter++}` } });
    if (res.statusCode !== 201) throw new Error(`booking not made (${res.statusCode}): ${res.body}`);
    return res.json().id as string;
  }

  /** A booking that used a voucher, written straight into the table (the voucher flow is not in the backend yet): 2 x 200 000 = 400 000, 40 000 off, 360 000 to pay. */
  async function bookWithVoucher(shop: Shop): Promise<string> {
    const c = (await t.pool.query<{ id: string }>("insert into customers (organization_id, full_name) values ($1, 'Voucher Guest') returning id", [shop.orgId])).rows[0]!.id;
    const code = `SES-9${String(counter++).padStart(3, "0")}-001`;
    const r = await t.pool.query<{ id: string }>(
      `insert into bookings (organization_id, booking_code, session_id, workshop_id, customer_id, source, quantity, status, unit_price_amount, total_amount, discount_amount, currency, guest_name, snapshot)
       values ($1, $2, $3, $4, $5, 'WALK_IN', 2, 'CONFIRMED', 200000, 360000, 40000, 'VND', 'Voucher Guest', $6::jsonb) returning id`,
      [shop.orgId, code, shop.sessionId, shop.workshopId, c, JSON.stringify({ workshopTitle: { en: "x" }, sessionCode: "SES-0001", startsAt: new Date().toISOString(), endsAt: new Date().toISOString(), timezone: "Asia/Ho_Chi_Minh", address: "", subtotalAmount: 400000, discounts: [{ code: "WELCOME10", amount: 40000 }] })],
    );
    return r.rows[0]!.id;
  }

  const pay = (shop: Shop, id: string, paid = true) => t.post(`/bookings/${id}/payment`, { paid }, { cookie: shop.cookie });
  const income = (shop: Shop, query = "") => t.get(`/finance/income${query}`, { cookie: shop.cookie });
  const adminGet = (url: string) => t.get(`/admin${url}`, { cookie: admin });
  const adminPut = async (url: string, body: unknown) => t.app.inject({ method: "PUT", url: `/api/v1/admin${url}`, payload: body as object, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: admin } });

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("finroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    a = await makeShop("fina");
    b = await makeShop("finb");
  });
  afterAll(async () => { await t.close(); });

  it("counts only the bookings that are paid, takes the fees on the price and gives the numbers worked out by hand", async () => {
    const empty = await income(a);
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ currency: "VND", rates: { maintenanceBps: 1000, serviceBps: 1000 }, totals: { income: 0, fees: 0, profit: 0 }, items: [], nextCursor: null });

    const unpaid = await book(a); // not paid: not in the numbers
    const paid = await book(a, 2); // 400 000 at 10% + 10%
    expect((await pay(a, paid)).statusCode).toBe(200);
    const res = (await income(a)).json();
    expect(res.totals).toEqual({ income: 400_000, maintenanceFee: 40_000, serviceFee: 40_000, fees: 80_000, profit: 320_000 });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ kind: "PAYMENT", amount: 400_000, originalPrice: 400_000, maintenanceFee: 40_000, serviceFee: 40_000, profit: 320_000, promotions: [] });
    expect(res.feeShares).toHaveLength(2);
    expect(res.series.points.length).toBeGreaterThan(0); // 180 days: one point a month
    expect(res.series.unit).toBe("month");
    void unpaid;

    // A voucher lowers what the shop earns, not the fees: income 360 000, fees on 400 000, profit 360 000 - 80 000.
    const vb = await bookWithVoucher(a);
    expect((await pay(a, vb)).statusCode).toBe(200);
    const after = (await income(a)).json();
    expect(after.totals).toEqual({ income: 760_000, maintenanceFee: 80_000, serviceFee: 80_000, fees: 160_000, profit: 600_000 });
    const row = after.items.find((i: { amount: number }) => i.amount === 360_000);
    expect(row).toMatchObject({ originalPrice: 400_000, maintenanceFee: 40_000, serviceFee: 40_000, profit: 280_000, promotions: [{ code: "WELCOME10", amount: 40_000 }] });

    // Putting a booking back to unpaid takes it out of the numbers (a reversal offsets the payment and the booking is no longer PAID).
    expect((await pay(a, paid, false)).statusCode).toBe(200);
    expect((await income(a)).json().totals.income).toBe(360_000);
  });

  it("filters the table by kind, pages it, and keeps the totals of the whole range", async () => {
    const id = await book(b, 1);
    await pay(b, id);
    const id2 = await book(b, 1);
    await pay(b, id2);
    const page1 = (await income(b, "?limit=1")).json();
    expect(page1.items).toHaveLength(1);
    expect(page1.nextCursor).not.toBeNull();
    expect(page1.totals.income).toBe(400_000); // all of the range, not of the page
    const page2 = (await income(b, `?limit=1&cursor=${page1.nextCursor}`)).json();
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0].id).not.toBe(page1.items[0].id);
    expect(page2.nextCursor).toBeNull();
    expect((await income(b, "?kind=REVERSAL")).json().items).toEqual([]);
    expect((await income(b, "?limit=1&cursor=garbage")).statusCode).toBe(400);
  });

  it("refuses a wrong range with the field that is wrong, and shows only the shop of the session", async () => {
    const fields = async (q: string) => (await income(a, q)).json().error.details.fields;
    expect((await income(a, "?from=2026-05-02&to=2026-05-01")).statusCode).toBe(422);
    expect(await fields("?from=2026-05-02&to=2026-05-01")).toEqual({ to: "beforeFrom" });
    expect(await fields("?from=2026-05-02")).toEqual({ to: "required" });
    expect(await fields("?to=2026-05-02")).toEqual({ from: "required" });
    expect(await fields("?from=2026-02-30&to=2026-03-01")).toEqual({ from: "invalid" });
    expect(await fields("?from=2025-01-01&to=2026-05-01")).toEqual({ to: "tooLong" });
    const ok = (await income(a, "?from=2026-01-01&to=2026-12-31")).json(); // 365 days is allowed
    expect(ok).toMatchObject({ from: "2026-01-01", to: "2026-12-31" });
    expect((await income(a, "?from=2000-01-01&to=2000-01-31")).json().totals.income).toBe(0);
    // The other shop's money is not here: shop B only has its own 400 000.
    expect((await income(b)).json().totals.income).toBe(400_000);
    expect((await t.get("/finance/income")).statusCode).toBe(401);
  });

  it("lets only the platform administrator set the rates, validates them, audits the change and uses them at once", async () => {
    const owner = (await t.app.inject({ method: "PUT", url: `/api/v1/admin/fees/${a.orgId}`, payload: { maintenanceBps: 100, serviceBps: 100, referralBps: 100, inviteBonusBps: 100 }, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: a.cookie } }));
    expect(owner.statusCode).toBe(403);
    expect((await t.get("/admin/fees")).statusCode).toBe(401);
    expect((await t.get("/admin/fees", { cookie: a.cookie })).statusCode).toBe(403);

    const bad = async (body: unknown) => (await adminPut(`/fees/${a.orgId}`, body)).json().error?.details?.fields;
    expect(await bad({ maintenanceBps: 6000, serviceBps: 4001, referralBps: 0, inviteBonusBps: 0 })).toEqual({ maintenanceBps: "totalTooHigh", serviceBps: "totalTooHigh" });
    expect(await bad({ maintenanceBps: -1, serviceBps: 0, referralBps: 0, inviteBonusBps: 0 })).toMatchObject({ maintenanceBps: "invalid" });
    expect(await bad({ maintenanceBps: 1.5, serviceBps: 0, referralBps: 0, inviteBonusBps: 0 })).toMatchObject({ maintenanceBps: "invalid" });
    expect(await bad({ maintenanceBps: 100, serviceBps: 100, referralBps: 10_001, inviteBonusBps: 0 })).toMatchObject({ referralBps: "invalid" });
    expect(await bad({ maintenanceBps: 100, serviceBps: "5" })).toMatchObject({ serviceBps: "invalid", referralBps: "required" });
    expect((await adminGet(`/organizations/${a.orgId}/finance-settings`)).json()).toMatchObject({ custom: false, maintenanceBps: 1000 }); // nothing was saved by the refused calls

    const ok = await adminPut(`/fees/${a.orgId}`, { maintenanceBps: 500, serviceBps: 250, referralBps: 700, inviteBonusBps: 300 });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ shopId: a.orgId, custom: true, maintenanceBps: 500, serviceBps: 250, referralBps: 700, inviteBonusBps: 300 });
    // D24: the new rates reach only what is paid AFTER the change. The shop has paid bookings worth 360 000 (a voucher one on a 400 000 price): its fees stay 10% + 10% of 400 000.
    expect((await income(a)).json()).toMatchObject({ rates: { maintenanceBps: 500, serviceBps: 250 }, totals: { income: 360_000, maintenanceFee: 40_000, serviceFee: 40_000, profit: 280_000 } });
    // a booking paid now is worked out with 5% + 2.5% of 200 000 (10 000 + 5 000), the old ones untouched
    expect((await pay(a, await book(a, 1))).statusCode).toBe(200);
    expect((await income(a)).json().totals).toEqual({ income: 560_000, maintenanceFee: 50_000, serviceFee: 45_000, fees: 95_000, profit: 465_000 });

    // The form of one shop sends only the two fees: the other two keep their values.
    const form = await adminPut(`/organizations/${a.orgId}/finance-settings`, { maintenanceBps: 600, serviceBps: 300 });
    expect(form.json()).toMatchObject({ maintenanceBps: 600, serviceBps: 300, referralBps: 700, inviteBonusBps: 300 });
    expect((await adminPut(`/fees/${randomUUID()}`, { maintenanceBps: 1, serviceBps: 1, referralBps: 1, inviteBonusBps: 1 })).statusCode).toBe(404);

    const log = await t.pool.query<{ before: { maintenanceBps: number }; after: { maintenanceBps: number }; actor_user_id: string }>("select before, after, actor_user_id from audit_logs where organization_id = $1 and action = 'fees.update' order by created_at", [a.orgId]);
    expect(log.rows).toHaveLength(2);
    expect(log.rows[0]).toMatchObject({ before: { maintenanceBps: 1000 }, after: { maintenanceBps: 500 } });
    expect(log.rows[0]!.actor_user_id).not.toBeNull();

    const list = (await adminGet(`/fees?q=${encodeURIComponent((await t.pool.query<{ name: string }>("select name from organizations where id = $1", [a.orgId])).rows[0]!.name)}`)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ shopId: a.orgId, custom: true, maintenanceBps: 600 });
    expect(list.defaults).toEqual({ maintenanceBps: 1000, serviceBps: 1000, referralBps: 1000, inviteBonusBps: 1000 });
  });

  it("applies one set of rates to every shop, all or nothing, and audits each shop", async () => {
    const before = (await t.pool.query("select * from organization_fee_settings")).rows;
    try {
      expect((await t.post("/admin/fees/bulk", { maintenanceBps: 9000, serviceBps: 2000, referralBps: 0, inviteBonusBps: 0 }, { cookie: admin })).statusCode).toBe(422);
      const res = await t.post("/admin/fees/bulk", { maintenanceBps: 400, serviceBps: 600, referralBps: 200, inviteBonusBps: 100 }, { cookie: admin });
      expect(res.statusCode).toBe(200);
      const shops = (await t.pool.query<{ n: number }>("select count(*)::int as n from organizations")).rows[0]!.n;
      expect(res.json().updated).toBe(shops);
      const rows = await t.pool.query("select maintenance_bps, service_bps from organization_fee_settings");
      expect(rows.rows).toHaveLength(shops);
      expect(rows.rows.every((r) => r.maintenance_bps === 400 && r.service_bps === 600)).toBe(true);
      expect((await t.pool.query("select 1 from audit_logs where organization_id = $1 and action = 'fees.bulk_update'", [b.orgId])).rowCount).toBe(1);
      expect((await income(b)).json().rates).toEqual({ maintenanceBps: 400, serviceBps: 600 });
    } finally {
      // the test database goes back to the rates it had
      await t.pool.query("delete from organization_fee_settings");
      for (const r of before) await t.pool.query("insert into organization_fee_settings (organization_id, maintenance_bps, service_bps, affiliate_bps, invite_bonus_bps, updated_at) values ($1, $2, $3, $4, $5, $6)", [r.organization_id, r.maintenance_bps, r.service_bps, r.affiliate_bps, r.invite_bonus_bps, r.updated_at]);
    }
  }, 300_000); // (the action touches EVERY shop, and the test database keeps the shops of every earlier run: thousands of them make it take longer than the default 20 seconds)

  it("shows the income of the platform: a line for each shop with payments, totals for each currency, and the months of one shop", async () => {
    await adminPut(`/fees/${b.orgId}`, { maintenanceBps: 1000, serviceBps: 1000, referralBps: 1000, inviteBonusBps: 1000 });
    const all = (await adminGet("/income")).json();
    const mine = all.items.find((i: { shopId: string }) => i.shopId === b.orgId);
    expect(mine).toMatchObject({ currency: "VND", entries: 2, collected: 400_000, originalPrice: 400_000, maintenanceFee: 40_000, serviceFee: 40_000, adminIncome: 80_000, affiliateFee: 0, referralBonus: 0, profit: 80_000 });
    expect(all.totals.find((x: { currency: string }) => x.currency === "VND").collected).toBeGreaterThanOrEqual(400_000 + 360_000);
    expect((await t.get("/admin/income", { cookie: a.cookie })).statusCode).toBe(403);
    expect((await adminGet("/income?from=2026-06-01")).statusCode).toBe(422);

    const detail = (await adminGet(`/income/${b.orgId}`)).json();
    expect(detail.shop).toMatchObject({ id: b.orgId, currency: "VND" });
    expect(detail.totals.income).toBe(400_000);
    expect(detail.items).toHaveLength(2);
    expect(detail.months).toHaveLength(1);
    expect(detail.months[0]).toMatchObject({ closed: false, entries: 2, collected: 400_000, invoice: 80_000, platformProfit: 80_000 });
    expect((await adminGet(`/income/${randomUUID()}`)).statusCode).toBe(404);
    expect((await t.get(`/admin/income/${b.orgId}`, { cookie: b.cookie })).statusCode).toBe(403);
  });

  it("closes the months that are over once, keeps their rates, and refuses to put a payment of a closed month back to unpaid", async () => {
    const shop = await makeShop("finc");
    const fresh = await book(shop, 1);
    await pay(shop, fresh); // a payment of this month: the month stays open
    // A payment of a month that is over: a row with an old date is appended (the rows of a payment are never edited), and the booking is PAID.
    const oldBooking = await book(shop, 1);
    await t.pool.query("insert into payments (organization_id, booking_id, type, amount, currency, method, recorded_at) values ($1, $2, 'PAYMENT', 200000, 'VND', 'CASH', now() - interval '70 days')", [shop.orgId, oldBooking]);
    await t.pool.query("update bookings set payment_status = 'PAID' where id = $1", [oldBooking]);
    // the shop has had 10% + 5% for a long time (a version of its history that began 100 days ago: a change made now would not reach a payment of 70 days ago, D24)
    await t.pool.query("insert into organization_fee_rates (organization_id, effective_from, maintenance_bps, service_bps, affiliate_bps, invite_bonus_bps) values ($1, now() - interval '100 days', 1000, 500, 0, 0)", [shop.orgId]);

    const jobs = t.app.get(MaintenanceService, { strict: false });
    const first = await jobs.closeMonths();
    expect(first.closed).toBeGreaterThanOrEqual(1);
    const closings = (await t.pool.query("select month, maintenance_bps, service_bps, totals from finance_month_closings where organization_id = $1", [shop.orgId])).rows;
    expect(closings).toHaveLength(1); // the current month stays open
    expect(closings[0]).toMatchObject({ maintenance_bps: 1000, service_bps: 500, totals: { entries: 1, collected: 200_000, maintenanceFee: 20_000, serviceFee: 10_000, invoice: 30_000, platformProfit: 30_000 } });
    expect((await jobs.closeMonths()).closed).toBe(0); // again: nothing more
    expect((await t.pool.query("select 1 from audit_logs where organization_id = $1 and action = 'finance.month_close'", [shop.orgId])).rowCount).toBe(1);

    // A change of the rates later does not change a closed month.
    await adminPut(`/fees/${shop.orgId}`, { maintenanceBps: 2000, serviceBps: 2000, referralBps: 0, inviteBonusBps: 0 });
    const detail = (await adminGet(`/income/${shop.orgId}?from=${new Date(Date.now() - 100 * 86_400_000).toISOString().slice(0, 10)}&to=${new Date().toISOString().slice(0, 10)}`)).json();
    const closed = detail.months.find((m: { closed: boolean }) => m.closed);
    expect(closed).toMatchObject({ closed: true, rates: { maintenanceBps: 1000, serviceBps: 500 }, invoice: 30_000 });
    const oldRow = detail.items.find((i: { amount: number; occurredAt: string }) => i.amount === 200_000 && Date.now() - Date.parse(i.occurredAt) > 60 * 86_400_000);
    expect(oldRow).toMatchObject({ maintenanceFee: 20_000, serviceFee: 10_000 }); // the old rates, not the 20% + 20% of now
    expect(detail.months.find((m: { closed: boolean }) => !m.closed)).toMatchObject({ rates: { maintenanceBps: 2000, serviceBps: 2000 } });

    // what is paid after the change is worked out with the new rates (20% + 20% of 200 000), what was paid before is not
    const later = await book(shop, 1);
    expect((await pay(shop, later)).statusCode).toBe(200);
    const rows = (await adminGet(`/income/${shop.orgId}`)).json().items as { id: string; amount: number; maintenanceFee: number; serviceFee: number }[];
    expect(rows.filter((r) => r.maintenanceFee === 40_000 && r.serviceFee === 40_000)).toHaveLength(1); // the payment made after the change
    expect(rows.filter((r) => r.maintenanceFee === 20_000 && r.serviceFee === 10_000)).toHaveLength(2); // the one of the closed month and the one paid before the change: both as they were (10% + 5%)

    // D10: the booking with a payment in the closed month cannot be put back to unpaid; one of the open month still can.
    const refused = await pay(shop, oldBooking, false);
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toMatchObject({ code: "MONTH_CLOSED" });
    expect((await pay(shop, fresh, false)).statusCode).toBe(200);
    expect((await t.pool.query("select payment_status from bookings where id = $1", [oldBooking])).rows[0]).toEqual({ payment_status: "PAID" });
  });

  it("keeps the history of the rates: it only grows", async () => {
    await expect(t.pool.query("update organization_fee_rates set maintenance_bps = 0")).rejects.toThrow(/append only/);
    await expect(t.pool.query("delete from organization_fee_rates")).rejects.toThrow(/append only/);
    await expect(t.pool.query("truncate organization_fee_rates")).rejects.toThrow(/append only/);
  });

  it("never changes or deletes a closed month, whoever asks", async () => {
    const row = (await t.pool.query<{ organization_id: string; month: string }>("select organization_id, month from finance_month_closings limit 1")).rows[0]!;
    await expect(t.pool.query("update finance_month_closings set maintenance_bps = 0 where organization_id = $1 and month = $2", [row.organization_id, row.month])).rejects.toThrow(/cannot be changed/);
    await expect(t.pool.query("delete from finance_month_closings where organization_id = $1 and month = $2", [row.organization_id, row.month])).rejects.toThrow(/cannot be changed/);
    await expect(t.pool.query("truncate finance_month_closings")).rejects.toThrow(/cannot be changed/);
  });
});
