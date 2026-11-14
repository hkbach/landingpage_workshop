import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { APP, PORT, seedPassword, SHOP } from "./helpers";

// The rules of a guest booking against the REAL API, called the way the booking form calls it (docs/E2E_TEST_CASES.md, section 2.2, the P0 cases E2E-PUB-*): the code sent by email (read
// from Mailpit), the seats, the number of guests, the price worked out by the server, a repeated request, the lock after wrong codes, and a suspended shop. Each test makes its own session
// so it never depends on what other tests booked. Needs the stack of e2e/README.md, the worker (it sends the emails) and the seeded accounts.
const OWNER = "linh@whiskladle.example";
const ADMIN = "admin@workshopkit.example";
const SLUG = "whiskladle";
const MAILPIT = process.env.E2E_MAILPIT ?? "http://127.0.0.1:8025";
const headers = { origin: APP };
const publicApi = `${SHOP}/api/v1/public/sites/${SLUG}`;
const shopOrigin = { origin: `http://${SLUG}.localtest.me:${PORT}` }; // (the form calls the public API from the host of the shop)

async function as(email: string): Promise<APIRequestContext> {
  const ctx = await playwrightRequest.newContext();
  expect((await ctx.post(`${APP}/api/v1/auth/login`, { headers, data: { email, password: seedPassword() } })).status(), `login of ${email}`).toBe(200);
  return ctx;
}

/** A RUNNING session of an active workshop of the shop, some days ahead, with `capacity` seats: its id and the workshop (price, max guests). */
async function freshSession(owner: APIRequestContext, capacity: number): Promise<{ id: string; workshop: { id: string; priceAmount: number; maxPerBooking: number } }> {
  const workshop = ((await (await owner.get(`${APP}/api/v1/workshops?status=ACTIVE`)).json()) as { items: Array<{ id: string; priceAmount: number; maxPerBooking: number }> }).items[0];
  expect(workshop, "the shop has an active workshop").toBeTruthy();
  for (let tries = 0; tries < 5; tries++) {
    const startsAt = new Date(Date.now() + (10 + Math.floor(Math.random() * 40)) * 86_400_000);
    startsAt.setUTCHours(2 + Math.floor(Math.random() * 10), Math.floor(Math.random() * 60), 0, 0);
    const made = await owner.post(`${APP}/api/v1/sessions`, { headers, data: { workshopId: workshop!.id, startsAt: startsAt.toISOString(), capacity } });
    if (made.status() !== 201) continue; // (another session may start at that very minute: pick another)
    const id = ((await made.json()) as { id: string }).id;
    expect((await owner.post(`${APP}/api/v1/sessions/${id}/start`, { headers })).status(), "the session is opened for booking").toBe(200);
    return { id, workshop: workshop! };
  }
  throw new Error("no session could be made");
}

const newEmail = (label: string) => `rule-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

/** Asks for a code for `email` and reads it from Mailpit. */
async function codeFor(api: APIRequestContext, email: string): Promise<string> {
  expect((await api.post(`${publicApi}/booking-otp`, { headers: shopOrigin, data: { email } })).status()).toBe(202);
  for (let i = 0; i < 30; i++) {
    const found = (await (await api.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`)).json()) as { messages?: Array<{ ID: string }> };
    const first = found.messages?.[0];
    if (first) {
      const message = (await (await api.get(`${MAILPIT}/api/v1/message/${first.ID}`)).json()) as { Text: string; Subject: string };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) {
        expect(message.Subject, "the subject never carries the code").not.toContain(code);
        return code;
      }
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No code arrived for ${email} (is the worker running?)`);
}

const guest = (email: string) => ({ fullName: "Rule Tester", email, country: "VN", phone: "+84 90 123 4567" });
const book = (api: APIRequestContext, body: Record<string, unknown>, key = `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`) =>
  api.post(`${publicApi}/bookings`, { headers: { ...shopOrigin, "idempotency-key": key }, data: body });

test.describe("the rules of a guest booking on the real API", () => {
  let owner: APIRequestContext;
  let api: APIRequestContext;
  test.beforeAll(async () => {
    owner = await as(OWNER);
    api = await playwrightRequest.newContext();
  });
  test.afterAll(async () => {
    await owner.dispose();
    await api.dispose();
  });

  test("E2E-PUB-25 / PUB-24: the server works the price out (a total, a status or a shop sent by the client are ignored), and a repeated request gives the same booking and takes the seats once", async () => {
    const { id, workshop } = await freshSession(owner, 5);
    const email = newEmail("price");
    const otp = await codeFor(api, email);
    const key = `e2e-price-${Date.now()}`;
    const body = { sessionId: id, quantity: 2, guest: guest(email), consent: true, otp, totalAmount: 1, status: "CONFIRMED", organizationId: "00000000-0000-4000-8000-000000000000" };
    const made = await book(api, body, key);
    expect(made.status()).toBe(201);
    const booking = (await made.json()) as { code: string; totalAmount: number; status: string };
    expect(booking.totalAmount).toBe(workshop.priceAmount * 2);
    expect(booking.status).toBe("NOT_CONFIRMED");

    const again = await book(api, body, key);
    expect(again.status()).toBe(200);
    expect(((await again.json()) as { code: string }).code).toBe(booking.code);
    const session = (await (await owner.get(`${APP}/api/v1/sessions/${id}`)).json()) as { reservedCount: number };
    expect(session.reservedCount).toBe(2);

    // the same key from another guest never answers with this booking
    const stranger = await book(api, { ...body, guest: guest(newEmail("stranger")) }, key);
    expect(stranger.status()).toBe(409);
  });

  test("E2E-PUB-21 / PUB-22: more guests than one booking takes is refused, and so is more than the seats left", async () => {
    const { id, workshop } = await freshSession(owner, 2);
    const email = newEmail("seats");
    const otp = await codeFor(api, email);
    const tooMany = await book(api, { sessionId: id, quantity: workshop.maxPerBooking + 1, guest: guest(email), consent: true, otp });
    expect(tooMany.status()).toBe(422);
    expect(((await tooMany.json()) as { error: { details: { fields: Record<string, string> } } }).error.details.fields.quantity).toBe("quantityRange");

    test.skip(workshop.maxPerBooking < 3, "the workshop takes fewer than 3 guests a booking: the seats case needs 3");
    const full = await book(api, { sessionId: id, quantity: 3, guest: guest(email), consent: true, otp });
    expect(full.status()).toBe(409);
    const error = ((await full.json()) as { error: { code: string; details: { remaining: number } } }).error;
    expect(error.code).toBe("SESSION_FULL");
    expect(error.details.remaining).toBe(2);
  });

  test("E2E-PUB-16 / PUB-17: a wrong code says how many tries are left; after five wrong codes even the right one is refused, and no booking is made", async () => {
    const { id } = await freshSession(owner, 5);
    const email = newEmail("otp");
    const otp = await codeFor(api, email);
    const wrong = otp === "000000" ? "111111" : "000000";
    const first = await book(api, { sessionId: id, quantity: 1, guest: guest(email), consent: true, otp: wrong });
    expect(first.status()).toBe(422);
    const firstError = ((await first.json()) as { error: { code: string; details: { attemptsLeft: number } } }).error;
    expect(firstError.code).toBe("OTP_INVALID");
    expect(firstError.details.attemptsLeft).toBe(4);
    for (let i = 0; i < 4; i++) await book(api, { sessionId: id, quantity: 1, guest: guest(email), consent: true, otp: wrong });
    const locked = await book(api, { sessionId: id, quantity: 1, guest: guest(email), consent: true, otp });
    expect([422, 429]).toContain(locked.status()); // (locked: the code is used up)
    const session = (await (await owner.get(`${APP}/api/v1/sessions/${id}`)).json()) as { reservedCount: number };
    expect(session.reservedCount).toBe(0);
  });

  test("E2E-PUB-10: a shop the administrator suspends is a 404 for guests (page and booking API alike), and comes back when it is reactivated", async ({ page }) => {
    const admin = await as(ADMIN);
    const org = ((await (await admin.get(`${APP}/api/v1/admin/organizations?q=${SLUG}`)).json()) as { items: Array<{ id: string; slug: string }> }).items.find((o) => o.slug === SLUG);
    expect(org, "the seeded shop").toBeTruthy();
    try {
      expect((await admin.post(`${APP}/api/v1/admin/organizations/${org!.id}/status`, { headers, data: { active: false, reason: "e2e: suspended for a moment" } })).status()).toBe(200);
      expect((await page.goto(`${SHOP}/`, { waitUntil: "domcontentloaded" }))?.status()).toBe(404);
      expect((await api.post(`${publicApi}/booking-otp`, { headers: shopOrigin, data: { email: newEmail("suspended") } })).status()).toBe(404);
    } finally {
      expect((await admin.post(`${APP}/api/v1/admin/organizations/${org!.id}/status`, { headers, data: { active: true } })).status(), "the shop is reactivated").toBe(200);
      await admin.dispose();
    }
    await expect.poll(async () => (await page.goto(`${SHOP}/`, { waitUntil: "domcontentloaded" }))?.status(), { timeout: 30_000 }).toBe(200);
  });
});
