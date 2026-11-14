import { expect, test, type APIRequestContext } from "@playwright/test";
import { APP, open, watchBrowser, seedPassword } from "./helpers";

// A guest books a workshop on the landing page of a shop served by the REAL API: the page, the sessions with their seats, the code that is emailed (read from Mailpit), the booking, the link
// that confirms it, and the lookup and the cancellation with the code and the email. Needs the stack of e2e/README.md and the seeded accounts (E2E_PASSWORD = the password of `pnpm db:seed`).
const PORT = Number(process.env.E2E_PORT ?? 3100);
const SHOP = `http://whiskladle.localtest.me:${PORT}`;
const MAILPIT = process.env.E2E_MAILPIT ?? "http://127.0.0.1:8025";
const OWNER = "linh@whiskladle.example";

/** The owner of the seeded shop makes sure a landing page is published (the seed has none): a hero, the workshops of the shop and a footer. */
async function ensureLandingPage(request: APIRequestContext): Promise<void> {
  const password = seedPassword();
  const headers = { origin: APP };
  const login = await request.post(`${APP}/api/v1/auth/login`, { headers, data: { email: OWNER, password } });
  expect(login.status(), "the seeded owner can log in").toBe(200);
  const list = (await (await request.get(`${APP}/api/v1/site/pages`)).json()) as { items: Array<{ id: string; isLive: boolean }> };
  if (list.items.some((p) => p.isLive)) return;
  const id = list.items[0]?.id ?? ((await (await request.post(`${APP}/api/v1/site/pages`, { headers, data: { name: "Main" } })).json()) as { id: string }).id;
  const content = {
    schemaVersion: 1,
    sections: [
      // (every field of a section: a page with fewer opens in the builder marked "needs attention")
      { id: "s-hero", type: "hero", enabled: true, props: { title: { en: "Whisk & Ladle" }, subtitle: { en: "Baking classes" }, imageUrl: "", ctaText: { en: "Book now" } } },
      { id: "s-workshops", type: "workshops", enabled: true, props: { heading: { en: "Our workshops" } } },
      { id: "s-footer", type: "footer", enabled: true, props: { text: { en: "Whisk & Ladle" }, socials: [] } },
    ],
    seo: { title: { en: "Whisk & Ladle" }, description: { en: "Baking classes" } },
  };
  const saved = await request.put(`${APP}/api/v1/site/pages/${id}/draft`, { headers, data: { content } });
  expect(saved.status(), "the draft is valid").toBe(200);
  const published = await request.post(`${APP}/api/v1/site/pages/${id}/publish`, { headers });
  expect(published.status(), "the page is published").toBe(200);
  await request.post(`${APP}/api/v1/auth/logout`, { headers });
}

/** The newest 6-digit code that Mailpit holds for this address. */
async function emailedCode(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 30; i++) {
    const found = (await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)).json()) as { messages?: Array<{ ID: string }> };
    const first = found.messages?.[0];
    if (first) {
      const message = (await (await request.get(`${MAILPIT}/api/v1/message/${first.ID}`)).json()) as { Text: string };
      const code = /\b(\d{6})\b/.exec(message.Text)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`No email with a code arrived for ${to}`);
}

test.describe("a guest on the real API", () => {
  test("opens the landing page of the shop, books a session with the emailed code, confirms with the link, and finds the booking with its code and email", async ({ page, request }) => {
    await ensureLandingPage(request);
    const problems = watchBrowser(page);
    const email = `guest-${Date.now()}@example.com`;
    await open(page, `${SHOP}/`);
    // (whatever the owner published last: the page of the shop shows its workshops with their Book buttons)
    await expect(page.getByRole("button", { name: /^Book / }).first()).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("otp-demo")).toHaveCount(0); // no demo code with the real API

    await page.getByRole("button", { name: /^Book / }).first().click();
    const dialog = page.getByRole("dialog", { name: "Book a workshop" });
    await expect(dialog.getByText("Step 1 of 5")).toBeVisible();
    // the first day that still has a time open (a time can be full, or too close to its start, after earlier runs)
    const days = dialog.getByRole("group", { name: "Choose a date" }).getByRole("radio", { disabled: false });
    const times = dialog.getByRole("group", { name: "Choose a time" }).getByRole("radio", { disabled: false });
    let picked = false;
    for (let i = 0; i < Math.min(await days.count(), 14) && !picked; i++) {
      await days.nth(i).locator("xpath=ancestor::label").click();
      if ((await times.count()) > 0) {
        await times.first().locator("xpath=ancestor::label").click();
        picked = true;
      }
    }
    expect(picked, "a day with an open time").toBe(true);
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("button", { name: "Next" }).click(); // guests
    await dialog.getByRole("textbox", { name: "Full name" }).fill("Ava Tran");
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByRole("combobox", { name: "Country" }).selectOption({ label: "Italy" });
    await dialog.getByRole("textbox", { name: "Phone / WhatsApp" }).fill("+39 333 123 4567");
    await dialog.getByRole("button", { name: "Next" }).click();
    await dialog.getByRole("checkbox", { name: /I agree to the booking terms/ }).check();
    await dialog.getByRole("button", { name: "Confirm booking" }).click();

    // 5. the code that the server emailed: a wrong one is refused, the right one books
    await expect(dialog.getByText("Step 5 of 5")).toBeVisible();
    const code = await emailedCode(request, email);
    await dialog.getByRole("textbox", { name: "Verification code" }).fill(code === "000000" ? "111111" : "000000");
    await dialog.getByRole("button", { name: "Verify and book" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await dialog.getByRole("textbox", { name: "Verification code" }).fill(code);
    await dialog.getByRole("button", { name: "Verify and book" }).click();

    await expect(page.getByRole("heading", { name: "Booking received", level: 1 })).toBeVisible({ timeout: 60_000 });
    const bookingCode = (await page.getByRole("region", { name: "Booking code" }).getByRole("paragraph").last().textContent())!.trim();
    expect(bookingCode).toMatch(/^[A-Z]{3}-\d{4}-\d{3}$/);
    await expect(page.getByRole("heading", { name: "Please confirm your booking" })).toBeVisible();

    // the link of the email confirms the booking (there is no demo link with the real API)
    await expect(page.getByRole("link", { name: "open the link of the email" })).toHaveCount(0);
    // (the worker sends the email after the page shows the booking: wait for it, up to 30 seconds)
    let messageId: string | undefined;
    for (let i = 0; i < 30 && !messageId; i++) {
      const mail = (await (await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email} subject:confirm`)}`)).json()) as { messages?: Array<{ ID: string }> };
      messageId = mail.messages?.[0]?.ID;
      if (!messageId) await new Promise((r) => setTimeout(r, 1000));
    }
    expect(messageId, "the confirmation email arrived").toBeTruthy();
    const text = ((await (await request.get(`${MAILPIT}/api/v1/message/${messageId}`)).json()) as { Text: string }).Text;
    const link = /(http:\/\/whiskladle\.localtest\.me:\d+\/booking\/confirm\/[\w-]+)/.exec(text)?.[1];
    expect(link, "the email has the link that confirms").toBeTruthy();
    await open(page, link!);
    await expect(page.getByText(/confirmed/i).first()).toBeVisible({ timeout: 60_000 });

    // the booking is found with its code AND its email, and only so
    await open(page, `${SHOP}/booking/${bookingCode}?email=${encodeURIComponent(email)}`);
    await expect(page.getByRole("region", { name: "Booking code" })).toContainText(bookingCode, { timeout: 60_000 });
    await open(page, `${SHOP}/booking/${bookingCode}?email=${encodeURIComponent("someone.else@example.com")}`);
    await expect(page.getByRole("region", { name: "Booking code" })).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test("a shop that does not exist is a 404, and the shop has a sitemap and a robots.txt of its own", async ({ page, request }) => {
    const missing = await page.goto(`${SHOP.replace("whiskladle", "no-such-shop-anywhere")}/`, { waitUntil: "domcontentloaded" });
    expect(missing?.status()).toBe(404);
    await ensureLandingPage(request);
    const sitemap = await request.get(`${SHOP}/sitemap.xml`);
    expect(sitemap.status()).toBe(200);
    expect(await sitemap.text()).toContain("hreflang=");
    expect(await (await request.get(`${SHOP}/robots.txt`)).text()).toContain("Disallow: /booking/");
  });
});
