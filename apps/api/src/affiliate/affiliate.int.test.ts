import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword, hashToken } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

// The affiliate links, the invite links and what they earn, on a real PostgreSQL (FR-CUST-02, FR-CUST-03, FR-ADM-15, FR-ADM-16, FR-ADM-18). The numbers are worked out by hand.
const d = describe.skipIf(!TEST_DATABASE_URL);

interface Shop { cookie: string; orgId: string; slug: string; workshopId: string; sessionId: string; title: string }
interface Account { cookie: string; id: string; email: string }
const OTP = "123456";
let ipCounter = 0;
const nextIp = (): string => `10.${Math.floor(ipCounter / 250) % 250}.${Math.floor(ipCounter++ % 250)}.7`;

d("affiliate and referral", () => {
  let t: TestApp;
  let admin: string;
  let a: Shop;
  let b: Shop;
  let draftWorkshop: string;
  let sharer: Account;
  let linkId = "";
  let linkCode = "";

  async function makeShop(label: string): Promise<Shop> {
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor(label), `Shop ${unique(label)}`));
    const cookie = cookieOf(res);
    const { id: orgId, slug } = res.json().organization as { id: string; slug: string };
    await t.pool.query("update organizations set status = 'ACTIVE' where id = $1", [orgId]);
    const title = `Aff ${unique("w")}`;
    const w = await t.post("/workshops", { title: { en: title }, durationMinutes: 90, priceAmount: 250_000, defaultCapacity: 40, maxPerBooking: 6, categories: ["COOKING"] }, { cookie });
    const workshopId = w.json().id as string;
    await t.post(`/workshops/${workshopId}/status`, { status: "ACTIVE" }, { cookie });
    const seq = (await t.pool.query<{ n: number }>("update organizations set session_seq = session_seq + 1 where id = $1 returning session_seq as n", [orgId])).rows[0]!.n;
    const s = await t.pool.query<{ id: string }>(
      `insert into workshop_sessions (organization_id, workshop_id, starts_at, origin_starts_at, ends_at, capacity, status, code, booking_cutoff_minutes)
       select $1, $2, s, s, s + interval '90 minutes', 40, 'RUNNING', $3, 120 from (select now() + interval '5 days' as s) x returning id`,
      [orgId, workshopId, `SES-${String(seq).padStart(4, "0")}`],
    );
    return { cookie, orgId, slug, workshopId, sessionId: s.rows[0]!.id, title };
  }

  const makeAccount = async (label: string, extra: Record<string, unknown> = {}): Promise<Account> => {
    const email = emailFor(label);
    const res = await t.post("/auth/signup", { ...signupBody("CUSTOMER", email), ...extra });
    if (res.statusCode !== 201 && res.statusCode !== 200) throw new Error(`signup failed (${res.statusCode}): ${res.body}`);
    return { cookie: cookieOf(res), id: res.json().id as string, email };
  };

  /** A guest books online with the code of an email planted in the table (the email flow has its own tests). */
  async function bookOnline(shop: Shop, email: string, over: { quantity?: number; ref?: string } = {}) {
    const lower = email.trim().toLowerCase();
    const id = (await t.pool.query<{ id: string }>("insert into booking_otps (organization_id, email, code_hash, expires_at) values ($1, $2, 'x', now() + interval '10 minutes') returning id", [shop.orgId, lower])).rows[0]!.id;
    await t.pool.query("update booking_otps set code_hash = $2 where id = $1", [id, hashToken(`${id}:${OTP}`)]);
    const res = await t.app.inject({
      method: "POST", url: `/api/v1/public/sites/${shop.slug}/bookings`, remoteAddress: nextIp(), headers: { "idempotency-key": `aff-${unique("k")}-key`, origin: "https://some-shop.example" },
      payload: { sessionId: shop.sessionId, quantity: over.quantity ?? 1, guest: { fullName: "Aff Guest", email: lower, country: "VN", phone: "+84 90 000 0000" }, consent: true, otp: OTP, ...(over.ref !== undefined ? { ref: over.ref } : {}) },
    });
    if (res.statusCode !== 201) throw new Error(`booking not made (${res.statusCode}): ${res.body}`);
    const code = res.json().code as string;
    const row = (await t.pool.query<{ id: string; affiliate_link_id: string | null }>("select id, affiliate_link_id from bookings where organization_id = $1 and booking_code = $2", [shop.orgId, code])).rows[0]!;
    return { code, id: row.id, linkId: row.affiliate_link_id };
  }

  const pay = (shop: Shop, id: string, paid = true) => t.post(`/bookings/${id}/payment`, { paid }, { cookie: shop.cookie });
  const wallet = (c: Account, query = "") => t.get(`/customer/${c.id}/wallet${query}`, { cookie: c.cookie });
  const links = (c: Account, query = "") => t.get(`/customer/${c.id}/referrals${query}`, { cookie: c.cookie });
  const adminGet = (url: string) => t.get(`/admin${url}`, { cookie: admin });
  const adminPut = (url: string, body: unknown) => t.app.inject({ method: "PUT", url: `/api/v1/admin${url}`, payload: body as object, remoteAddress: "10.1.1.1", headers: { origin: "http://app.localtest.me:3000", cookie: admin } });
  const setRates = (shop: Shop, r: { maintenanceBps: number; serviceBps: number; referralBps: number; inviteBonusBps: number }) => adminPut(`/fees/${shop.orgId}`, r);

  beforeAll(async () => {
    t = await startApp();
    const email = emailFor("affroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    a = await makeShop("affa");
    b = await makeShop("affb");
    const draft = await t.post("/workshops", { title: { en: `Draft ${unique("w")}` }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 10, maxPerBooking: 4, categories: ["COOKING"] }, { cookie: a.cookie });
    draftWorkshop = draft.json().id as string; // stays DRAFT
    sharer = await makeAccount("sharer");
    // deterministic rates for the shop of the test: 10% maintenance, 10% service, 10% affiliate, 10% invite bonus
    expect((await setRates(a, { maintenanceBps: 1000, serviceBps: 1000, referralBps: 1000, inviteBonusBps: 1000 })).statusCode).toBe(200);
  });
  afterAll(async () => { await t.close(); });

  it("gives an account one link for each workshop, only for an active workshop of an active shop, and nobody else's list", async () => {
    expect((await t.get(`/customer/${sharer.id}/referrals`)).statusCode).toBe(401);
    const empty = (await links(sharer, `?q=${encodeURIComponent(a.title)}`)).json(); // the test database has many shops: the search finds this one
    expect(empty.items).toEqual([]);
    const program = empty.programs.find((p: { workshopId: string }) => p.workshopId === a.workshopId);
    expect(program).toMatchObject({ shopSlug: a.slug, referralBps: 1000, linkId: null });
    expect(empty.programs.some((p: { workshopId: string }) => p.workshopId === draftWorkshop)).toBe(false); // a workshop that is not active is not offered
    expect((await links(sharer, "?q=Draft")).json().programs.some((p: { workshopId: string }) => p.workshopId === draftWorkshop)).toBe(false);
    expect(JSON.stringify(empty)).not.toMatch(/maintenance|service/i); // the customer sees the Affiliate fee only

    const made = await t.post(`/customer/${sharer.id}/referrals`, { workshopId: a.workshopId }, { cookie: sharer.cookie });
    expect(made.statusCode).toBe(201);
    const link = made.json();
    linkId = link.id;
    linkCode = link.code;
    expect(link.code).toMatch(/^A[A-HJKMNP-Z2-9]{8}$/);
    expect(link).toMatchObject({ workshopId: a.workshopId, shopSlug: a.slug, status: "ON_GOING", clicks: 0, bookings: 0, referralFee: 0, referralBps: 1000, currency: "VND" });
    expect(link.link).toBe(`http://${a.slug}.localtest.me:3000/?ref=${link.code}&book=${a.workshopId}`);
    // again: the same link (200), not a second one
    const again = await t.post(`/customer/${sharer.id}/referrals`, { workshopId: a.workshopId }, { cookie: sharer.cookie });
    expect([again.statusCode, again.json().id]).toEqual([200, link.id]);
    expect((await links(sharer)).json().items).toHaveLength(1);
    expect((await links(sharer, `?q=${encodeURIComponent(a.title)}`)).json().programs.find((p: { workshopId: string }) => p.workshopId === a.workshopId).linkId).toBe(link.id);

    expect((await t.post(`/customer/${sharer.id}/referrals`, { workshopId: draftWorkshop }, { cookie: sharer.cookie })).json().error.code).toBe("WORKSHOP_INACTIVE");
    expect((await t.post(`/customer/${sharer.id}/referrals`, { workshopId: randomUUID() }, { cookie: sharer.cookie })).statusCode).toBe(404);
    expect((await t.post(`/customer/${sharer.id}/referrals`, { workshopId: "nope" }, { cookie: sharer.cookie })).statusCode).toBe(422);

    const other = await makeAccount("other");
    const theirs = (await t.post(`/customer/${other.id}/referrals`, { workshopId: a.workshopId }, { cookie: other.cookie })).json();
    expect(theirs.code).not.toBe(link.code); // each account has its own link
    expect((await links(sharer)).json().items).toHaveLength(1);
    // another account's id in the path is a 404
    expect((await t.get(`/customer/${other.id}/referrals`, { cookie: sharer.cookie })).statusCode).toBe(404);
    expect((await t.post(`/customer/${other.id}/referrals`, { workshopId: a.workshopId }, { cookie: sharer.cookie })).statusCode).toBe(404);
    expect((await t.get(`/customer/${other.id}/invites`, { cookie: sharer.cookie })).statusCode).toBe(404);
  });

  it("counts the visits of a link, once for each visit, and answers the same 404 for a wrong shop or code", async () => {
    const click = (slug: string, body: unknown, from = nextIp()) => t.app.inject({ method: "POST", url: `/api/v1/public/sites/${slug}/referrals/click`, payload: body as object, remoteAddress: from, headers: { origin: "https://some-shop.example" } });
    const ok = await click(a.slug, { code: linkCode, count: 3 });
    expect([ok.statusCode, ok.json()]).toEqual([200, { workshopId: a.workshopId, status: "ON_GOING" }]);
    expect((await click(a.slug, { code: linkCode })).statusCode).toBe(200); // one by default
    expect((await links(sharer)).json().items[0].clicks).toBe(4);
    expect((await click(b.slug, { code: linkCode })).statusCode).toBe(404); // the link is of another shop
    expect((await click(a.slug, { code: "AAAAAAAAA" })).statusCode).toBe(404);
    expect((await click(a.slug, { code: "bad" })).statusCode).toBe(404);
    expect((await click("no-such-shop", { code: linkCode })).statusCode).toBe(404);
    expect((await click(a.slug, { code: linkCode, count: 0 })).statusCode).toBe(422);
    expect((await click(a.slug, { code: linkCode, count: 21 })).statusCode).toBe(422);
    expect((await t.pool.query("select clicks from affiliate_links where id = $1", [linkId])).rows[0]).toEqual({ clicks: 4 }); // the refused calls counted nothing
    const same = nextIp();
    let last = 200;
    for (let i = 0; i < 31; i++) last = (await click(a.slug, { code: linkCode }, same)).statusCode;
    expect(last).toBe(429); // a visitor cannot inflate the count
  });

  it("counts a booking for the link only when the code is right, the workshop is the one of the link, the link is on and it is not the sharer's own booking", async () => {
    const guest1 = emailFor("buyer");
    const counted = await bookOnline(a, guest1, { quantity: 2, ref: linkCode });
    expect(counted.linkId).toBe(linkId);
    expect((await bookOnline(a, emailFor("wrong"), { ref: "AZZZZZZZZ" })).linkId).toBeNull(); // a wrong code: the booking is made, nothing counted
    expect((await bookOnline(a, emailFor("junk"), { ref: "not a code at all!" })).linkId).toBeNull();
    expect((await bookOnline(b, emailFor("elsewhere"), { ref: linkCode })).linkId).toBeNull(); // the code of a link of another shop
    expect((await bookOnline(a, emailFor("none"))).linkId).toBeNull(); // no code
    expect((await bookOnline(a, ` ${sharer.email.toUpperCase()} `, { ref: linkCode })).linkId).toBeNull(); // the sharer's own booking, however the email is typed
  });

  it("works the Affiliate fee out of the PAID bookings as they are now: the original price x the rate of the shop, and nothing for an unpaid one", async () => {
    const buyer = (await t.pool.query<{ id: string; booking_code: string }>("select id, booking_code from bookings where affiliate_link_id = $1", [linkId])).rows;
    expect(buyer).toHaveLength(1);
    const id = buyer[0]!.id;
    expect((await wallet(sharer)).json().balances).toEqual([]); // nothing paid yet

    expect((await pay(a, id)).statusCode).toBe(200); // 2 x 250 000 = 500 000, at 10%
    let item = (await links(sharer)).json().items[0];
    expect(item).toMatchObject({ bookings: 1, referralFee: 50_000 });
    expect((await wallet(sharer)).json().balances).toEqual([{ source: "AFFILIATE", currency: "VND", earned: 50_000, pending: 0, withdrawn: 0, available: 50_000, limits: { minAmount: 0, maxAmount: 0 } }]);
    expect((await wallet(sharer, "?source=REFERRAL")).json().balances).toEqual([]);

    expect((await pay(a, id, false)).statusCode).toBe(200); // put back to unpaid: it stops counting
    item = (await links(sharer)).json().items[0];
    expect(item).toMatchObject({ bookings: 0, referralFee: 0 });
    expect((await wallet(sharer)).json().balances).toEqual([]); // nothing earned: no wallet line
    expect((await pay(a, id)).statusCode).toBe(200);

    // the rate of the shop is the one it has now
    await setRates(a, { maintenanceBps: 1000, serviceBps: 1000, referralBps: 500, inviteBonusBps: 1000 });
    expect((await links(sharer)).json().items[0]).toMatchObject({ referralBps: 500, referralFee: 25_000 });
    await setRates(a, { maintenanceBps: 1000, serviceBps: 1000, referralBps: 1000, inviteBonusBps: 1000 });

    // and it goes into the wallet: it can be withdrawn, not more
    const bank = { bankName: "Demo Bank", bankAccountNumber: "0123456789", bankAccountHolder: "Sharer One" };
    expect((await t.post(`/customer/${sharer.id}/withdrawals`, { source: "AFFILIATE", currency: "VND", amount: 50_001, ...bank }, { cookie: sharer.cookie })).json().error.details.fields).toEqual({ amount: "exceeds" });
    expect((await t.post(`/customer/${sharer.id}/withdrawals`, { source: "AFFILIATE", currency: "VND", amount: 30_000, ...bank }, { cookie: sharer.cookie })).statusCode).toBe(201);
    expect((await wallet(sharer)).json().balances[0]).toMatchObject({ earned: 50_000, pending: 30_000, available: 20_000 });
  });

  it("lets the administrator switch a link off with a reason: it counts no new booking and its visitor sees the workshop ended, what it earned stays", async () => {
    expect((await t.post(`/admin/affiliate/${linkId}`, { disabled: true, reason: "x" }, { cookie: sharer.cookie })).statusCode).toBe(403);
    expect((await t.post(`/admin/affiliate/${linkId}`, { disabled: true }, { cookie: admin })).json().error.details.fields).toEqual({ reason: "required" });
    expect((await t.post(`/admin/affiliate/${randomUUID()}`, { disabled: true, reason: "x" }, { cookie: admin })).statusCode).toBe(404);
    const off = await t.post(`/admin/affiliate/${linkId}`, { disabled: true, reason: "  Fake bookings  " }, { cookie: admin });
    expect([off.statusCode, off.json()]).toEqual([200, { id: linkId, disabled: true, disabledReason: "Fake bookings" }]);
    expect((await t.post(`/admin/affiliate/${linkId}`, { disabled: true, reason: "again" }, { cookie: admin })).json().error.code).toBe("STATUS");

    const mine = (await links(sharer)).json().items[0];
    expect(mine).toMatchObject({ status: "DEACTIVE", link: null, referralFee: 50_000 }); // the address is not given, the earnings stay
    const click = await t.app.inject({ method: "POST", url: `/api/v1/public/sites/${a.slug}/referrals/click`, payload: { code: linkCode }, remoteAddress: nextIp(), headers: { origin: "https://some-shop.example" } });
    expect(click.json()).toEqual({ workshopId: a.workshopId, status: "DEACTIVE" }); // still counted, the page shows "workshop ended"
    expect((await bookOnline(a, emailFor("late"), { ref: linkCode })).linkId).toBeNull(); // no new booking counts

    const list = (await adminGet(`/directory/affiliate?q=${encodeURIComponent(sharer.email)}`)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({ id: linkId, accountEmail: sharer.email, shopSlug: a.slug, bookings: 1, referralFee: 50_000, disabled: true, disabledReason: "Fake bookings", status: "DEACTIVE" });
    expect(list.items[0].clicks).toBeGreaterThanOrEqual(5);
    expect((await t.get("/admin/directory/affiliate", { cookie: sharer.cookie })).statusCode).toBe(403);
    expect((await adminGet(`/directory/affiliate?q=${linkCode}`)).json().items).toHaveLength(1);
    expect((await adminGet(`/directory/affiliate?q=${encodeURIComponent(sharer.email)}&from=2000-01-01&to=2000-01-02`)).json().items).toEqual([]);

    expect((await t.post(`/admin/affiliate/${linkId}`, { disabled: false }, { cookie: admin })).json()).toEqual({ id: linkId, disabled: false, disabledReason: null });
    expect((await links(sharer)).json().items[0]).toMatchObject({ status: "ON_GOING" });
    const log = await t.pool.query<{ action: string; organization_id: string }>("select action, organization_id from audit_logs where entity_id = $1 and action like 'affiliate.%' order by created_at", [linkId]);
    expect(log.rows.map((r) => r.action)).toEqual(["affiliate.register", "affiliate.disable", "affiliate.enable"]);
    expect(log.rows.every((r) => r.organization_id === a.orgId)).toBe(true);
  });

  it("goes Deactive when the workshop is switched off and back On-going when it is switched on again, and keeps the old link", async () => {
    await t.pool.query("update workshop_sessions set status = 'CLOSED' where id = $1", [a.sessionId]); // a workshop is deactivated only when its sessions are closed
    expect((await t.post(`/workshops/${a.workshopId}/status`, { status: "DRAFT" }, { cookie: a.cookie })).statusCode).toBe(200);
    expect((await links(sharer)).json().items[0]).toMatchObject({ status: "DEACTIVE", link: null });
    expect((await t.post(`/customer/${sharer.id}/referrals`, { workshopId: a.workshopId }, { cookie: sharer.cookie })).statusCode).toBe(200); // the old link is kept
    expect((await t.post(`/workshops/${a.workshopId}/status`, { status: "ACTIVE" }, { cookie: a.cookie })).statusCode).toBe(200);
    await t.pool.query("update workshop_sessions set status = 'RUNNING' where id = $1", [a.sessionId]);
    expect((await links(sharer)).json().items[0]).toMatchObject({ status: "ON_GOING" });
  });

  it("gives an account one invite link that never changes, and ignores a wrong, a switched off or a repeated code without a word", async () => {
    const first = (await t.get(`/customer/${sharer.id}/invites`, { cookie: sharer.cookie })).json();
    expect(first.code).toMatch(/^I[A-HJKMNP-Z2-9]{8}$/);
    expect(first).toMatchObject({ disabled: false, items: [], total: 0, earned: [], link: `http://localtest.me:3000/?invite=${first.code}` });
    expect((await t.get(`/customer/${sharer.id}/invites`, { cookie: sharer.cookie })).json().code).toBe(first.code); // the same code every time

    const friend = await makeAccount("friend", { inviteCode: first.code });
    await makeAccount("wrongcode", { inviteCode: "IZZZZZZZZ" }); // the account is made all the same
    await makeAccount("junkcode", { inviteCode: "not a code" });
    const mine = (await t.get(`/customer/${sharer.id}/invites`, { cookie: sharer.cookie })).json();
    expect(mine.total).toBe(1);
    expect(mine.items[0]).toMatchObject({ status: "REGISTERED", bonus: 0, currency: null });
    expect(mine.items[0].email).toMatch(/^f\*\*\*@example\.test$/); // the email is masked
    expect(JSON.stringify(mine)).not.toContain(friend.email);

    // a friend belongs to one inviter only: nobody can register twice, so a second code cannot take the friend over
    expect((await t.pool.query("select count(*)::int as n from referrals where friend_user_id = $1", [friend.id])).rows[0]).toEqual({ n: 1 });
    await expect(t.pool.query("insert into referrals (inviter_user_id, friend_user_id) values ($1, $2)", [sharer.id, friend.id])).rejects.toThrow(/unique|duplicate/);
    await expect(t.pool.query("insert into referrals (inviter_user_id, friend_user_id) values ($1, $1)", [sharer.id])).rejects.toThrow(/referrals_not_self/);
    (globalThis as Record<string, unknown>).__affFriend = friend;
  });

  it("pays the Referral bonus once for each friend: on the first PAID booking made after registering, never on one made before", async () => {
    const friend = (globalThis as Record<string, unknown>).__affFriend as Account;
    const inviter = sharer;
    const first = await bookOnline(a, friend.email, { quantity: 1 }); // 250 000 at 10% = 25 000
    const second = await bookOnline(a, friend.email, { quantity: 2 });
    const invites = async () => (await t.get(`/customer/${inviter.id}/invites`, { cookie: inviter.cookie })).json();
    expect((await invites()).items[0]).toMatchObject({ status: "REGISTERED", bonus: 0 }); // nothing paid yet

    expect((await pay(a, first.id)).statusCode).toBe(200);
    expect((await invites()).items[0]).toMatchObject({ status: "EARNED", bonus: 25_000, currency: "VND", bookingCode: first.code });
    expect((await pay(a, second.id)).statusCode).toBe(200); // the second one earns nothing more
    const done = await invites();
    expect(done.items[0]).toMatchObject({ bonus: 25_000, bookingCode: first.code });
    expect(done.earned).toEqual([{ currency: "VND", amount: 25_000 }]);
    expect((await wallet(inviter, "?source=REFERRAL")).json().balances).toEqual([{ source: "REFERRAL", currency: "VND", earned: 25_000, pending: 0, withdrawn: 0, available: 25_000, limits: { minAmount: 0, maxAmount: 0 } }]);

    // the first one put back to unpaid: the bonus goes to the next paid booking (500 000 at 10% = 50 000)
    expect((await pay(a, first.id, false)).statusCode).toBe(200);
    expect((await invites()).items[0]).toMatchObject({ bonus: 50_000, bookingCode: second.code });
    expect((await pay(a, first.id)).statusCode).toBe(200);
    expect((await invites()).items[0]).toMatchObject({ bonus: 25_000, bookingCode: first.code });

    // a booking made BEFORE the friend registered is never counted: the same email booked first, then registered with the code
    const early = emailFor("early");
    const before = await bookOnline(a, early, { quantity: 1 });
    expect((await pay(a, before.id)).statusCode).toBe(200);
    const code = (await invites()).code;
    await makeAccount("earlyaccount", { email: early, inviteCode: code }).catch(() => undefined); // (an email that already booked is just a guest: the account is new)
    const mine = (await invites()).items;
    expect(mine.filter((i: { status: string }) => i.status === "EARNED")).toHaveLength(1); // still only the first friend
  });

  it("lets the administrator list the invite links with their friends and switch one off: a friend who registers afterwards is not counted", async () => {
    const list = (await adminGet(`/directory/referrals?q=${encodeURIComponent(sharer.email)}`)).json();
    expect(list.items).toHaveLength(1);
    const row = list.items[0];
    expect(row).toMatchObject({ accountEmail: sharer.email, disabled: false, friends: 2, paidFriends: 1, earned: [{ currency: "VND", amount: 25_000 }] });
    expect(row.items.map((f: { status: string }) => f.status).sort()).toEqual(["EARNED", "REGISTERED"]);
    expect(row.items.find((f: { status: string }) => f.status === "EARNED")).toMatchObject({ bonus: 25_000, currency: "VND" });
    expect((await adminGet(`/directory/referrals?q=${encodeURIComponent(row.items[0].email)}`)).json().items).toHaveLength(1); // search by a friend's email
    expect((await adminGet(`/directory/referrals?q=${row.code}`)).json().items).toHaveLength(1);
    expect((await adminGet(`/directory/referrals?q=${encodeURIComponent(sharer.email)}&from=2000-01-01&to=2000-01-02`)).json().items).toEqual([]);
    expect((await t.get("/admin/directory/referrals", { cookie: sharer.cookie })).statusCode).toBe(403);

    expect((await t.post(`/admin/referrals/${sharer.id}`, { disabled: true }, { cookie: admin })).json().error.details.fields).toEqual({ reason: "required" });
    expect((await t.post(`/admin/referrals/${randomUUID()}`, { disabled: true, reason: "x" }, { cookie: admin })).statusCode).toBe(404);
    expect((await t.post(`/admin/referrals/${sharer.id}`, { disabled: true, reason: "Spam" }, { cookie: admin })).json()).toEqual({ accountId: sharer.id, disabled: true, disabledReason: "Spam" });
    expect((await t.post(`/admin/referrals/${sharer.id}`, { disabled: true, reason: "again" }, { cookie: admin })).json().error.code).toBe("STATUS");
    const code = (await t.get(`/customer/${sharer.id}/invites`, { cookie: sharer.cookie })).json();
    expect(code.disabled).toBe(true);
    await makeAccount("afterdisable", { inviteCode: code.code });
    expect(((await t.get(`/customer/${sharer.id}/invites`, { cookie: sharer.cookie })).json()).total).toBe(2); // not counted; the friends from before and their bonus stay
    expect((await t.post(`/admin/referrals/${sharer.id}`, { disabled: false }, { cookie: admin })).statusCode).toBe(200);
    const log = await t.pool.query<{ action: string }>("select action from audit_logs where entity_id = $1 and action like 'referral.%' order by created_at", [sharer.id]);
    expect(log.rows.map((r) => r.action)).toEqual(["referral.disable", "referral.enable"]);
  });

  it("takes the Affiliate fee and the Referral bonus off the profit of the platform, and never shows them to the shop", async () => {
    // Shop A has paid: 500 000 (through the link), 250 000 + 500 000 (the friend), 250 000 (the early guest) and the unpaid ones do not count.
    const detail = (await adminGet(`/income/${a.orgId}`)).json();
    const fees = detail.totals; // the shop's own view: income, maintenance, service
    // Maintenance + service = 20% of the original prices of the paid bookings; the platform pays 50 000 (affiliate) and 25 000 (bonus) out of it
    expect(detail.platform).toEqual({ affiliateFee: 50_000, referralBonus: 25_000, adminIncome: fees.fees, profit: fees.fees - 75_000 });
    const all = (await adminGet("/income")).json();
    const mine = all.items.find((i: { shopId: string }) => i.shopId === a.orgId);
    expect(mine).toMatchObject({ affiliateFee: 50_000, referralBonus: 25_000, adminIncome: fees.fees, profit: fees.fees - 75_000 });
    expect(all.totals.find((x: { currency: string }) => x.currency === "VND").affiliateFee).toBeGreaterThanOrEqual(50_000);
    expect(detail.items.some((i: { affiliateFee?: number }) => i.affiliateFee === 50_000)).toBe(true); // a row of the admin's table shows it
    expect(detail.months[0]).toMatchObject({ affiliateFee: 50_000, referralBonus: 25_000, platformProfit: fees.fees - 75_000 });

    // the shop never sees them
    const shopView = JSON.stringify((await t.get("/finance/income", { cookie: a.cookie })).json());
    expect(shopView).not.toMatch(/affiliate|referral|bonus/i);
    expect((await t.get("/finance/income", { cookie: a.cookie })).json().totals.fees).toBe(fees.fees);
  });

  it("keeps the code, the owner and the workshop of a link for good, and the link a booking came through", async () => {
    await expect(t.pool.query("update affiliate_links set code = 'AAAAAAAAA' where id = $1", [linkId])).rejects.toThrow(/cannot be changed/);
    await expect(t.pool.query("update affiliate_links set user_id = $2 where id = $1", [linkId, randomUUID()])).rejects.toThrow();
    await expect(t.pool.query("update affiliate_links set workshop_id = $2 where id = $1", [linkId, draftWorkshop])).rejects.toThrow(/cannot be changed|foreign key/);
    await expect(t.pool.query("update bookings set affiliate_link_id = null where affiliate_link_id = $1", [linkId])).rejects.toThrow(/cannot be changed/);
    await expect(t.pool.query("update invite_links set code = 'IAAAAAAAA' where user_id = $1", [sharer.id])).rejects.toThrow(/cannot be changed/);
    await expect(t.pool.query("delete from referrals where inviter_user_id = $1", [sharer.id])).rejects.toThrow(/append only/);
    await expect(t.pool.query("update referrals set inviter_user_id = friend_user_id")).rejects.toThrow();
  });
});
