import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp , otpHash } from "../test/helpers";

// Promotions on a real PostgreSQL (FR-PROMO-01, FR-ADM-25): the rules of the owner, the price of a booking worked out by the server, and what the platform administrator may do.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string; w1: string; w2: string; sessionId: string }
const OTP = "123456";
let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.5`;

d("promotions", () => {
  let t: TestApp;
  let admin: string;
  let a: Shop;
  let b: Shop;
  let today = "";
  const day = (offset: number): string => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

  async function makeShop(label: string): Promise<Shop> {
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const make = async (price: number) => {
      const w = await t.post("/workshops", { title: { en: `Promo ${unique("w")}` }, durationMinutes: 60, priceAmount: price, defaultCapacity: 40, maxPerBooking: 6, categories: ["COOKING"] }, { cookie });
      await t.post(`/workshops/${w.json().id}/status`, { status: "ACTIVE" }, { cookie });
      return w.json().id as string;
    };
    const w1 = await make(200_000);
    const w2 = await make(250_000);
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [orgId])).rows[0]!.n;
    const s = await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code, booking_cutoff_minutes)
       select $1, $2, s, s, s + interval '60 minutes', 40, 'RUNNING', $3, 120 from (select now() + interval '5 days' as s) x returning id`,
      [orgId, w1, `SES-${String(seq).padStart(4, "0")}`],
    );
    return { cookie, orgId, slug, w1, w2, sessionId: s.rows[0]!.id };
  }

  /** The body of a promotion; every field can be changed by a test. */
  const body = (over: Record<string, unknown> = {}) => ({
    title: { en: "Promo" }, description: {}, discountType: "PERCENT", discountValue: 20, code: unique("c").slice(0, 8).toUpperCase(), stacking: "SINGLE", appliesTo: "ALL", workshopIds: [] as string[],
    startDate: day(0), endDate: day(10), enabled: true, ...over,
  });
  const create = (shop: Shop, over: Record<string, unknown> = {}) => t.post("/promotions", body(over), { cookie: shop.cookie });
  const put = (shop: Shop, id: string, over: Record<string, unknown>) => t.app.inject({ method: "PUT", url: `/api/v1/promotions/${id}`, payload: body(over), remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: shop.cookie } });
  const patch = (shop: Shop, id: string, enabled: boolean) => t.app.inject({ method: "PATCH", url: `/api/v1/promotions/${id}`, payload: { enabled }, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: shop.cookie } });
  const del = (shop: Shop, id: string) => t.app.inject({ method: "DELETE", url: `/api/v1/promotions/${id}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: shop.cookie } });
  const list = async (shop: Shop) => (await t.get("/promotions", { cookie: shop.cookie })).json();
  const mustCreate = async (shop: Shop, over: Record<string, unknown> = {}) => {
    const res = await create(shop, over);
    if (res.statusCode !== 201) throw new Error(`promotion not made (${res.statusCode}): ${res.body}`);
    return res.json();
  };

  /** A guest books online with a code planted in the table (the email flow has its own tests). */
  async function bookOnline(shop: Shop, extra: Record<string, unknown>, quantity = 2) {
    const email = emailFor("guest");
    const id = (await t.pool.query<{ id: string }>("insert into booking_otps (organization_id, email, code_hash, expires_at) values ($1, $2, 'x', now() + interval '10 minutes') returning id", [shop.orgId, email])).rows[0]!.id;
    await t.pool.query("update booking_otps set code_hash = $2 where id = $1", [id, otpHash(id, OTP)]);
    return t.app.inject({
      method: "POST", url: `/api/v1/public/sites/${shop.slug}/bookings`, remoteAddress: nextIp(), headers: { "idempotency-key": `promo-${unique("k")}-key`, origin: "https://some-shop.example" },
      payload: { sessionId: shop.sessionId, quantity, guest: { fullName: "Promo Guest", email, country: "VN", phone: "+84 90 000 0000" }, consent: true, otp: OTP, ...extra },
    });
  }
  const bookingRow = async (code: string, shop: Shop) => (await t.pool.query<{ id: string; total_amount: string; discount_amount: string; promotion_ids: string[]; snapshot: { subtotalAmount: number; discounts?: { code: string; amount: number; promotionId: string }[] } }>("select id, total_amount, discount_amount, promotion_ids, snapshot from bookings where organization_id = $1 and booking_code = $2", [shop.orgId, code])).rows[0]!;

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("promoroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    a = await makeShop("proma");
    b = await makeShop("promb");
    today = (await list(a)).today;
  });
  afterAll(async () => { await t.close(); });

  it("starts empty, answers only for the shop of the session, and makes a promotion with the code in capitals", async () => {
    expect(await list(a)).toMatchObject({ items: [], limit: 20, maxConcurrent: 5 });
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect((await t.get("/promotions")).statusCode).toBe(401);
    expect((await t.get("/promotions", { cookie: cookieOf(await t.post("/auth/signup", signupBody("CUSTOMER", emailFor("promocust")), { from: "10.9.9.8" })) })).statusCode).toBe(403);

    const made = await create(a, { code: " early20 ", title: { en: "Early bird", vi: "Đặt sớm" }, description: { en: "20% off" } });
    expect(made.statusCode).toBe(201);
    const p = made.json();
    expect(p).toMatchObject({ code: "EARLY20", discountType: "PERCENT", discountValue: 20, stacking: "SINGLE", appliesTo: "ALL", workshopIds: [], enabled: true, status: "ACTIVE", startDate: day(0), endDate: day(10) });
    expect((await list(a)).items).toHaveLength(1);
    expect((await list(b)).items).toEqual([]); // not in the other shop

    // the other shop cannot touch it: the same 404 as an unknown id
    expect((await put(b, p.id, {})).statusCode).toBe(404);
    expect((await patch(b, p.id, false)).statusCode).toBe(404);
    expect((await del(b, p.id)).statusCode).toBe(404);
    expect((await patch(a, randomUUID(), false)).statusCode).toBe(404);
    expect((await t.pool.query("select 1 from audit_logs where entity_id = $1 and action = 'promotion.create' and organization_id = $2", [p.id, a.orgId])).rowCount).toBe(1);
  });

  it("refuses a wrong promotion with the field that is wrong", async () => {
    const fields = async (over: Record<string, unknown>) => (await create(a, over)).json().error?.details?.fields;
    const noCode = body();
    delete (noCode as Record<string, unknown>).code;
    expect((await t.post("/promotions", noCode, { cookie: a.cookie })).json().error.details.fields).toEqual({ code: "codeRequired" });
    expect(await fields({ code: "bad code!" })).toEqual({ code: "codeInvalid" });
    expect(await fields({ code: "AB" })).toEqual({ code: "codeInvalid" });
    expect(await fields({ discountValue: 101 })).toEqual({ discountValue: "percentTooHigh" });
    expect(await fields({ discountValue: 0 })).toEqual({ discountValue: "valueInvalid" });
    expect(await fields({ endDate: day(-1), startDate: day(-5) })).toEqual({ endDate: "endInPast" });
    expect(await fields({ startDate: day(5), endDate: day(2) })).toEqual({ endDate: "endBeforeStart" });
    expect(await fields({ appliesTo: "SELECTED", workshopIds: [] })).toEqual({ workshopIds: "workshopRequired" });
    expect(await fields({ title: {} })).toEqual({ title: "titleRequired" });
    expect(await fields({ appliesTo: "SELECTED", workshopIds: [b.w1] })).toEqual({ workshopIds: "workshopUnknown" }); // a workshop of another shop looks like none
    expect(await fields({ code: "early20" })).toEqual({ code: "codeTaken" }); // capitals and small letters are the same code
    expect((await list(a)).items).toHaveLength(1); // none of the refused calls made anything
  });

  it("edits and deletes only a paused or over promotion, and pauses and resumes one", async () => {
    const p = await mustCreate(a, { code: "EDITME", discountValue: 10 });
    expect((await put(a, p.id, { code: "EDITME", discountValue: 15 })).json().error.code).toBe("EDIT_NOT_ALLOWED"); // active: pause it first
    expect((await del(a, p.id)).json().error.code).toBe("DELETE_NOT_ALLOWED");
    const paused = await patch(a, p.id, false);
    expect(paused.json()).toMatchObject({ enabled: false, status: "PAUSED" });
    const edited = await put(a, p.id, { code: "EDITME", discountValue: 15, enabled: false });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().discountValue).toBe(15);
    expect((await patch(a, p.id, true)).json()).toMatchObject({ enabled: true, status: "ACTIVE" });
    expect((await patch(a, p.id, false)).statusCode).toBe(200);
    expect((await del(a, p.id)).statusCode).toBe(204);
    expect((await del(a, p.id)).statusCode).toBe(404);
    // a promotion that is over (it cannot be made over through the API: its last day cannot be in the past): it is deleted, or renewed with new dates
    const insertOver = async (code: string) => (await t.pool.query<{ id: string }>("insert into promotions (organization_id, title, discount_type, discount_value, code, start_date, end_date) values ($1, '{\"en\":\"Old\"}', 'PERCENT', 10, $2, $3, $4) returning id", [a.orgId, code, day(-20), day(-10)])).rows[0]!.id;
    const overId = await insertOver("OLDONE");
    expect((await list(a)).items.find((x: { id: string }) => x.id === overId)).toMatchObject({ status: "EXPIRED" });
    expect((await patch(a, overId, false)).statusCode).toBe(200); // pausing an over one is allowed (nothing uses it)
    expect((await patch(a, overId, true)).json().error.details.fields).toEqual({ endDate: "endInPast" }); // but it cannot be resumed
    const renewed = await put(a, overId, { code: "OLDONE", startDate: day(0), endDate: day(5), enabled: false });
    expect([renewed.statusCode, renewed.json().status]).toEqual([200, "PAUSED"]); // renewed with new dates
    expect((await del(a, overId)).statusCode).toBe(204);
    const over2 = await insertOver("OLDTWO");
    expect((await del(a, over2)).statusCode).toBe(204); // an over one is deleted without being paused
  });

  it("allows at most 5 promotions at once and 20 in all, and refuses one that could make a workshop free", async () => {
    const shop = await makeShop("promc");
    const first = [];
    for (let i = 0; i < 5; i++) first.push(await mustCreate(shop, { code: `RUN${i}A`, discountValue: 5 }));
    const sixth = await create(shop, { code: "RUN5A", discountValue: 5 });
    expect([sixth.statusCode, sixth.json().error.code]).toEqual([409, "CONCURRENT_LIMIT"]);
    expect(sixth.json().error.details).toMatchObject({ date: day(0), max: 5 });
    // a sixth that starts after the others end is fine
    expect((await create(shop, { code: "LATER1", startDate: day(11), endDate: day(20), discountValue: 5 })).statusCode).toBe(201);
    // paused ones fill the shop up to 20; the 21st is refused
    for (let i = 0; i < 14; i++) await mustCreate(shop, { code: `PAU${i}A`, enabled: false, discountValue: 5 });
    expect((await list(shop)).items).toHaveLength(20);
    expect((await create(shop, { code: "TOOMANY", enabled: false })).json().error.code).toBe("LIMIT_REACHED");
    // resuming a sixth is like adding it again
    const paused = (await list(shop)).items.find((x: { code: string }) => x.code === "PAU0A");
    expect((await patch(shop, paused.id, true)).json().error.code).toBe("CONCURRENT_LIMIT");
    expect((await patch(shop, first[0].id, false)).statusCode).toBe(200); // pausing one makes room
    expect((await patch(shop, paused.id, true)).statusCode).toBe(200);

    // free workshops: 60% + 40% that can be combined are 100% of the price of every workshop
    const other = await makeShop("promd");
    await mustCreate(other, { code: "SIXTY", discountValue: 60, stacking: "MULTIPLE" });
    const free = await create(other, { code: "FORTY", discountValue: 40, stacking: "MULTIPLE" });
    expect([free.statusCode, free.json().error.code]).toEqual([422, "FULL_DISCOUNT"]);
    expect(free.json().error.details.workshopIds.sort()).toEqual([other.w1, other.w2].sort());
    expect(free.json().error.details.fields).toEqual({ discountValue: "fullDiscount" });
    expect((await create(other, { code: "FORTYONE", discountValue: 39, stacking: "MULTIPLE" })).statusCode).toBe(201); // 99% is a warning on the screen, not a refusal
    expect((await create(other, { code: "FIXEDALL", discountType: "FIXED_AMOUNT", discountValue: 200_000, appliesTo: "SELECTED", workshopIds: [other.w1], stacking: "SINGLE" })).json().error.code).toBe("FULL_DISCOUNT"); // a fixed amount as big as the price
    const saved = await mustCreate(other, { code: "PAUSEDFULL", discountValue: 50, stacking: "MULTIPLE", enabled: false }); // saved paused (50 + 60 = 110%) ...
    expect((await patch(other, saved.id, true)).json().error.code).toBe("FULL_DISCOUNT"); // ... but it cannot be resumed
    expect((await t.pool.query("select count(*)::int as n from promotions where organization_id = $1", [other.orgId])).rows[0]!.n).toBe(3); // a refused one left no row behind
  });

  it("does not let a workshop become free by lowering its price under a fixed discount (the rule checked from the side of the workshop)", async () => {
    const shop = await makeShop("promfree");
    await mustCreate(shop, { code: "FIXED150", discountType: "FIXED_AMOUNT", discountValue: 150_000, appliesTo: "SELECTED", workshopIds: [shop.w2] });
    expect((await t.post(`/workshops/${shop.w2}/status`, { status: "DRAFT" }, { cookie: shop.cookie })).statusCode).toBe(200); // (only a draft is edited)
    const edit = (priceAmount: number) => t.app.inject({
      method: "PUT", url: `/api/v1/workshops/${shop.w2}`, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: shop.cookie },
      payload: { title: { en: "Promo free" }, durationMinutes: 60, priceAmount, defaultCapacity: 40, maxPerBooking: 6, categories: ["COOKING"] },
    });
    const free = await edit(150_000);
    expect([free.statusCode, free.json().error.code]).toEqual([422, "FULL_DISCOUNT"]);
    expect(free.json().error.details.fields).toEqual({ priceAmount: "fullDiscount" });
    expect((await t.pool.query("select price_amount::int as p from workshops where id = $1", [shop.w2])).rows[0]!.p).toBe(250_000); // nothing changed
    expect((await edit(180_000)).statusCode).toBe(200); // still above the discount
  });

  it("shows the promotions that run today on the landing page, and prices a booking on the server with the ones the guest chose", async () => {
    const shop = await makeShop("pricing");
    const early = await mustCreate(shop, { code: "EARLY20", discountValue: 20, stacking: "SINGLE", title: { en: "Early" } });
    const group = await mustCreate(shop, { code: "GROUP10", discountValue: 10, stacking: "MULTIPLE" });
    const cash = await mustCreate(shop, { code: "CASH50", discountType: "FIXED_AMOUNT", discountValue: 50_000, stacking: "MULTIPLE", appliesTo: "SELECTED", workshopIds: [shop.w1] });
    const later = await mustCreate(shop, { code: "LATER5", discountValue: 5, startDate: day(3), endDate: day(9) }); // scheduled: not today
    const stopped = await mustCreate(shop, { code: "STOPPED", discountValue: 5, enabled: false });
    const site = (await t.get(`/public/sites/${shop.slug}`)).json();
    expect(site.promotions.map((p: { code: string }) => p.code).sort()).toEqual(["CASH50", "EARLY20", "GROUP10"]); // only the running ones
    expect(site.promotions.find((p: { code: string }) => p.code === "EARLY20")).toMatchObject({ discountType: "PERCENT", discountValue: 20, stacking: "SINGLE", appliesTo: "ALL" });

    // one promotion: 2 guests x 200 000 = 400 000, 20% = 80 000 off
    const one = await bookOnline(shop, { promotionIds: [early.id], totalAmount: 1, unitPriceAmount: 1 }); // a total from the client is never read
    expect(one.statusCode).toBe(201);
    const row = await bookingRow(one.json().code, shop);
    expect([Number(row.total_amount), Number(row.discount_amount), row.promotion_ids]).toEqual([320_000, 80_000, [early.id]]);
    expect(row.snapshot).toMatchObject({ subtotalAmount: 400_000, discounts: [{ code: "EARLY20", amount: 80_000, promotionId: early.id }] });

    // two that can be combined: each percentage of the ORIGINAL price (10% of 400 000) and the fixed amount: 400 000 - 40 000 - 50 000
    const both = await bookOnline(shop, { promotionIds: [group.id, cash.id, group.id] }); // a promotion given twice counts once
    expect(both.statusCode).toBe(201);
    const row2 = await bookingRow(both.json().code, shop);
    expect([Number(row2.total_amount), Number(row2.discount_amount)]).toEqual([310_000, 90_000]);
    expect(row2.snapshot.discounts?.map((x) => x.amount).sort((p, q) => p - q)).toEqual([40_000, 50_000]);

    // not accepted: a promotion that must be used alone next to another, one that does not run today, one that is paused, one that does not exist, one of another shop
    const refused = async (promotionIds: string[]) => (await bookOnline(shop, { promotionIds })).json().error?.details?.fields;
    expect(await refused([early.id, group.id])).toEqual({ promotionIds: "notCombinable" });
    expect(await refused([later.id])).toEqual({ promotionIds: "unavailable" });
    expect(await refused([stopped.id])).toEqual({ promotionIds: "unavailable" });
    expect(await refused([randomUUID()])).toEqual({ promotionIds: "unavailable" });
    expect(await refused([(await mustCreate(a, { code: unique("x").slice(0, 8).toUpperCase() })).id])).toEqual({ promotionIds: "unavailable" }); // a promotion of another shop
    expect((await bookOnline(shop, { promotionIds: ["not-an-id"] })).statusCode).toBe(422);
    // no promotion: the full price
    const plain = await bookOnline(shop, {});
    expect(Number((await bookingRow(plain.json().code, shop)).total_amount)).toBe(400_000);
    // a promotion for one workshop does not apply to the session of another workshop's booking: CASH50 is for W1, the session is W1's, so it did apply above; an unrelated shop's session is refused by the session check
    expect((await bookOnline(shop, { promotionIds: [] })).statusCode).toBe(201);
  });

  it("keeps a booking's discount when the promotion is paused, edited or deleted, and stops a pause while a live booking of a coming session uses it", async () => {
    const shop = await makeShop("inuse");
    const promo = await mustCreate(shop, { code: "USEDONE", discountValue: 25 });
    const booked = await bookOnline(shop, { promotionIds: [promo.id] }, 2); // 400 000 - 100 000
    expect(booked.statusCode).toBe(201);
    const row = await bookingRow(booked.json().code, shop);
    expect(Number(row.total_amount)).toBe(300_000);
    const pause = await patch(shop, promo.id, false);
    expect([pause.statusCode, pause.json().error.code]).toEqual([409, "PROMOTION_IN_USE"]);
    expect(pause.json().error.details).toMatchObject({ count: 1, bookingCodes: [booked.json().code] });
    // the booking is cancelled: the promotion can be paused, edited, deleted
    expect((await t.post(`/bookings/${row.id}/cancel`, { reason: "Changed plans" }, { cookie: shop.cookie })).statusCode).toBe(200);
    expect((await patch(shop, promo.id, false)).statusCode).toBe(200);
    expect((await del(shop, promo.id)).statusCode).toBe(204);
    expect(Number((await bookingRow(booked.json().code, shop)).total_amount)).toBe(300_000); // the booking is as it was
    expect((await bookingRow(booked.json().code, shop)).snapshot.discounts).toHaveLength(1);
  });

  it("lets the platform administrator pause a promotion with a reason: the owner cannot resume it, the bookings keep their discount, and only the administrator resumes it", async () => {
    const shop = await makeShop("admin");
    const code = `BAD${unique("").toUpperCase().slice(0, 9)}`; // the test database keeps the promotions of earlier runs: the search must find only this one
    const promo = await mustCreate(shop, { code, discountValue: 30 });
    const booked = await bookOnline(shop, { promotionIds: [promo.id] }, 1);
    expect(booked.statusCode).toBe(201);
    const row = await bookingRow(booked.json().code, shop);

    const list1 = (await t.get(`/admin/directory/promotions?q=${code}`, { cookie: admin })).json();
    expect(list1.items).toHaveLength(1);
    expect(list1.items[0]).toMatchObject({ code, shopSlug: shop.slug, status: "ACTIVE", usedBookings: 1, discountTotal: 60_000, heldByAdmin: null });
    expect((await t.get("/admin/directory/promotions", { cookie: shop.cookie })).statusCode).toBe(403);
    expect((await t.get(`/admin/directory/promotions?status=PAUSED&q=${code}`, { cookie: admin })).json().items).toEqual([]);

    const hold = (hold: boolean, reason?: string, cookie = admin) => t.post(`/admin/promotions/${promo.id}`, { hold, ...(reason !== undefined ? { reason } : {}) }, { cookie });
    expect((await hold(true, "x", shop.cookie)).statusCode).toBe(403);
    expect((await hold(true)).json().error.details.fields).toEqual({ reason: "required" });
    expect((await t.post(`/admin/promotions/${randomUUID()}`, { hold: true, reason: "x" }, { cookie: admin })).statusCode).toBe(404);
    expect((await hold(false)).json().error.code).toBe("NOT_HELD");
    // unlike the owner, the administrator is not stopped by the live booking that uses the promotion
    const held = await hold(true, "  Misleading offer  ");
    expect([held.statusCode, held.json()]).toEqual([200, { id: promo.id, enabled: false, heldByAdmin: "Misleading offer" }]);
    expect((await hold(true, "again")).json().error.code).toBe("ALREADY_HELD");

    expect((await list(shop)).items.find((x: { id: string }) => x.id === promo.id)).toMatchObject({ enabled: false, status: "PAUSED", heldByAdmin: "Misleading offer" });
    expect((await patch(shop, promo.id, true)).json().error.code).toBe("HELD_BY_ADMIN"); // the owner cannot put it back
    expect((await put(shop, promo.id, { code, discountValue: 30, enabled: true })).json().error.code).toBe("HELD_BY_ADMIN");
    expect((await put(shop, promo.id, { code, discountValue: 25, enabled: false })).statusCode).toBe(200); // but may edit it while it is paused
    expect((await bookOnline(shop, { promotionIds: [promo.id] }, 1)).json().error.details.fields).toEqual({ promotionIds: "unavailable" }); // no new booking gets it
    expect(Number((await bookingRow(booked.json().code, shop)).discount_amount)).toBe(60_000); // the old one keeps its discount
    expect(row.promotion_ids).toEqual([promo.id]);

    const back = await hold(false);
    expect(back.json()).toEqual({ id: promo.id, enabled: true, heldByAdmin: null }); // it was running and is not over: it runs again
    expect((await list(shop)).items.find((x: { id: string }) => x.id === promo.id)).toMatchObject({ enabled: true, status: "ACTIVE" });
    expect((await hold(false)).json().error.code).toBe("NOT_HELD");
    const log = await t.pool.query<{ action: string }>("select action from audit_logs where entity_id = $1 and action like 'promotion.%' order by created_at", [promo.id]);
    expect(log.rows.map((r) => r.action)).toEqual(["promotion.create", "promotion.pause", "promotion.update", "promotion.resume"]);
  });
});
