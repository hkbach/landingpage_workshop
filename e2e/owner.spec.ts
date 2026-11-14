import { expect, test, type APIRequestContext } from "@playwright/test";
import { APP, login, open, watchBrowser, seedPassword } from "./helpers";

// The shop owner area against the REAL API: what the owner does is kept by the server. Needs the stack of e2e/README.md and E2E_PASSWORD (the password of `pnpm db:seed`).
const OWNER = "linh@whiskladle.example";
const SLUG = "whiskladle";

test.describe("the shop owner on the real API", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OWNER, seedPassword());
  });

  test("changes the settings of the shop, and the server keeps them", async ({ page }) => {
    const problems = watchBrowser(page);
    await open(page, `${APP}/shopowner/${SLUG}/settings`);
    const phone = page.getByRole("textbox", { name: "Phone" }).first();
    await expect(phone).toBeVisible({ timeout: 90_000 });
    const value = `+84 90 ${Math.floor(1000000 + Math.random() * 8999999)}`;
    // (the page is hydrated after it is shown: type again until the field holds exactly the new value)
    await expect(async () => {
      await phone.fill(value);
      await expect(phone).toHaveValue(value, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("status").filter({ hasText: /saved/i })).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByRole("textbox", { name: "Phone" }).first()).toHaveValue(value, { timeout: 60_000 });
    expect(problems).toEqual([]);
  });

  test("creates a workshop as a draft, activates it, and it is in the list after a reload", async ({ page }) => {
    const problems = watchBrowser(page);
    const title = `E2E Workshop ${Date.now().toString(36)}`;
    await open(page, `${APP}/shopowner/${SLUG}/workshops`);
    await page.getByTestId("new-workshop-button").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Title" }).first().fill(title);
    await dialog.getByTestId("workshop-categories").locator("label").first().click(); // (the checkbox itself is visually hidden)
    await dialog.getByRole("textbox", { name: /^Price per guest/ }).fill("500000");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("workshop-created")).toBeVisible({ timeout: 30_000 });
    await page.reload({ waitUntil: "domcontentloaded" });
    const row = page.getByRole("row").filter({ hasText: title });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByTestId("activate-button").click();
    await expect(row.getByText("Active", { exact: true })).toBeVisible({ timeout: 30_000 });
    expect(problems).toEqual([]);
  });

  test("starts a session, and cancels a booking of it: the server keeps both", async ({ page, request }) => {
    const problems = watchBrowser(page);
    const { code, sessionId, day } = await prepareSession(request);
    await open(page, `${APP}/shopowner/${SLUG}/sessions`);
    // only that day (the list is long, and shows ten sessions at a time)
    await expect(page.getByRole("textbox", { name: "From" })).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      await page.getByRole("textbox", { name: "To" }).fill(day);
      await page.getByRole("textbox", { name: "From" }).fill(day);
      await expect(page.getByRole("textbox", { name: "From" })).toHaveValue(day, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    const card = page.getByRole("listitem").filter({ hasText: code });
    await expect(card).toBeVisible({ timeout: 90_000 });
    await card.getByRole("button", { name: "Start" }).click();
    await expect.poll(async () => (await (await request.get(`${APP}/api/v1/sessions/${sessionId}`)).json()).status, { timeout: 30_000 }).toBe("RUNNING");

    // a guest at the door: the owner makes the booking for them
    const booking = await request.post(`${APP}/api/v1/bookings`, { headers: { origin: APP, "idempotency-key": `e2e-${Date.now()}-${Math.random().toString(36).slice(2)}` }, data: { sessionId, quantity: 1, source: "WALK_IN", fullName: "Walk In Guest" } });
    expect(booking.status()).toBe(201);
    const bookingCode = ((await booking.json()) as { code: string }).code;
    await open(page, `${APP}/shopowner/${SLUG}/bookings`);
    await page.getByTestId("preset-all").click();
    await expect(async () => {
      await page.getByRole("searchbox").or(page.getByRole("textbox", { name: /search/i })).first().fill(bookingCode);
      await expect(page.getByRole("row").filter({ hasText: bookingCode })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 40_000 });
    const row = page.getByRole("row").filter({ hasText: bookingCode });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByRole("button", { name: "Cancel booking" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox").fill("Guest changed their mind");
    await dialog.getByRole("button", { name: "Cancel booking" }).click();
    await expect.poll(async () => (await (await request.get(`${APP}/api/v1/bookings?q=${bookingCode}`)).json()).items[0]?.status, { timeout: 30_000 }).toBe("CANCELLED");
    expect(problems).toEqual([]);
  });

  test("edits the landing page in the builder: the draft is kept by the server; a page made from the starter can be published", async ({ page }) => {
    const request = page.context().request; // (it carries the session of the owner who logged in)
    const problems = watchBrowser(page);
    // a page of the shop that was never edited: the shop has two at most, so the last one is used when there are two already
    const headers = { origin: APP };
    const pages = (await (await request.get(`${APP}/api/v1/site/pages`)).json()) as { items: Array<{ id: string }> };
    const pageId = pages.items.length >= 2 ? pages.items[pages.items.length - 1]!.id : ((await (await request.post(`${APP}/api/v1/site/pages`, { headers, data: { name: `E2E ${Date.now().toString(36)}` } })).json()) as { id: string }).id;
    await open(page, `${APP}/shopowner/${SLUG}/site/${pageId}`);
    const title = `Cooking with E2E ${Date.now().toString(36)}`;
    const field = page.getByRole("textbox", { name: "Title" }).first();
    await expect(field).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      await field.fill(title);
      await expect(field).toHaveValue(title, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 30_000 }); // (the autosave waits two seconds)
    await open(page, `${APP}/shopowner/${SLUG}/site/${pageId}`);
    await expect(page.getByRole("textbox", { name: "Title" }).first()).toHaveValue(title, { timeout: 60_000 });
    // the page made from the starter has nothing that needs attention: Publish is on, and the live page of the shop shows the new title
    const publish = page.getByRole("button", { name: "Publish" }).first();
    await expect(publish).toBeEnabled({ timeout: 30_000 });
    await publish.click();
    await expect.poll(async () => await (await request.get(`http://whiskladle.localtest.me:${process.env.E2E_PORT ?? 3100}/`)).text(), { timeout: 60_000 }).toContain(title);
    expect(problems).toEqual([]);
  });

  test("a page saved with sections that lack fields opens in the builder with nothing to fix, and can be edited and published", async ({ page }) => {
    const request = page.context().request;
    const problems = watchBrowser(page);
    const headers = { origin: APP };
    const pages = (await (await request.get(`${APP}/api/v1/site/pages`)).json()) as { items: Array<{ id: string }> };
    const pageId = pages.items.length >= 2 ? pages.items[pages.items.length - 1]!.id : ((await (await request.post(`${APP}/api/v1/site/pages`, { headers, data: { name: `E2E ${Date.now().toString(36)}` } })).json()) as { id: string }).id;
    // what a script or an older builder leaves: the hero without its image, the footer with no fields at all
    const thin = {
      schemaVersion: 1,
      sections: [
        { id: "s-hero", type: "hero", enabled: true, props: { title: { en: "Thin page" }, subtitle: { en: "Few fields" }, ctaText: { en: "Book now" } } },
        { id: "s-workshops", type: "workshops", enabled: true, props: { heading: { en: "Our workshops" } } },
        { id: "s-footer", type: "footer", enabled: true, props: {} },
      ],
      seo: { title: { en: "Thin page" }, description: { en: "Few fields" } },
    };
    expect((await request.put(`${APP}/api/v1/site/pages/${pageId}/draft`, { headers, data: { content: thin } })).status()).toBe(200);

    await open(page, `${APP}/shopowner/${SLUG}/site/${pageId}`);
    const title = page.getByRole("textbox", { name: "Title" }).first();
    await expect(title).toBeVisible({ timeout: 90_000 });
    await expect(page.getByText(/marked as needing attention/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Publish" }).first()).toBeEnabled({ timeout: 30_000 });
    const edited = `Edited thin page ${Date.now().toString(36)}`;
    await expect(async () => {
      await title.fill(edited);
      await expect(title).toHaveValue(edited, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await expect(page.getByText("Draft saved")).toBeVisible({ timeout: 30_000 });
    expect(problems).toEqual([]);
  });

  test("opens every page of the owner area on the data of the server, with no error in the page", async ({ page }) => {
    test.setTimeout(300_000);
    const problems = watchBrowser(page);
    const pages: Array<[string, RegExp]> = [
      ["", /Overview/], ["/today", /Today/], ["/bookings", /Bookings/], ["/customers", /Customers/], ["/workshops", /Workshops/], ["/sessions", /Sessions/],
      ["/finance", /Income/], ["/promotions", /Promotion/], ["/ratings", /Ratings/], ["/site", /Landing pages/], ["/settings", /Shop settings|Settings/i],
    ];
    for (const [path, heading] of pages) {
      await open(page, `${APP}/shopowner/${SLUG}${path}`);
      await expect(page.getByRole("heading", { name: heading, level: 1 }).first(), path || "overview").toBeVisible({ timeout: 90_000 });
      await expect(page.getByText("This page couldn’t load"), path || "overview").toHaveCount(0);
    }
    expect(problems).toEqual([]);
  });
});

/** A session of an active workshop in a few days (made through the API, as the owner): its code and id. */
async function prepareSession(request: APIRequestContext): Promise<{ code: string; sessionId: string; day: string }> {
  const headers = { origin: APP };
  const login = await request.post(`${APP}/api/v1/auth/login`, { headers, data: { email: OWNER, password: seedPassword() } });
  expect(login.status()).toBe(200);
  const workshops = (await (await request.get(`${APP}/api/v1/workshops?status=ACTIVE`)).json()) as { items: Array<{ id: string }> };
  const workshopId = workshops.items[0]?.id;
  expect(workshopId, "the shop has an active workshop").toBeTruthy();
  const startsAt = new Date(Date.now() + (3 + Math.floor(Math.random() * 20)) * 86_400_000);
  startsAt.setUTCHours(3, Math.floor(Math.random() * 59), 0, 0);
  const made = await request.post(`${APP}/api/v1/sessions`, { headers, data: { workshopId, startsAt: startsAt.toISOString() } });
  expect(made.status()).toBe(201);
  const session = (await made.json()) as { id: string; code: string };
  const day = `${String(startsAt.getUTCMonth() + 1).padStart(2, "0")}/${String(startsAt.getUTCDate()).padStart(2, "0")}/${startsAt.getUTCFullYear()}`; // (what the date field shows: the shop is at UTC+7, the session starts in the morning there)
  return { code: session.code, sessionId: session.id, day };
}
