import { expect, test } from "@playwright/test";
import { APP, login, open, watchBrowser, seedPassword } from "./helpers";

// The platform administrator against the REAL API. Needs the stack of e2e/README.md and E2E_PASSWORD (the password of `pnpm db:seed`).
const ADMIN = "admin@workshopkit.example";

const PAGES = [
  "organizations", "sessions", "bookings", "customers", "landing-pages", "affiliate", "referrals", "ratings", "promotions", "emails", "messages", "reports", "fees", "income",
  "legal", "settings", "support-contact", "audit-logs", "media",
];

test.describe("the platform administrator on the real API", () => {
  test("opens every page of the admin area on the data of the server, with no error in the page", async ({ page }) => {
    test.setTimeout(600_000);
    await login(page, ADMIN, seedPassword());
    const failures: string[] = [];
    for (const path of PAGES) {
      const problems = watchBrowser(page);
      const errors: string[] = [];
      const onConsole = (m: { type(): string; text(): string }) => { if (m.type() === "error" && !/Failed to load resource|favicon|404|401|403/.test(m.text())) errors.push(m.text().slice(0, 200)); };
      page.on("console", onConsole);
      await open(page, `${APP}/systemadmin/${path}`);
      const heading = page.getByRole("heading", { level: 1 }).first();
      const ok = await heading.waitFor({ timeout: 60_000 }).then(() => true, () => false);
      await page.waitForTimeout(1_500);
      const broken = (await page.getByText("This page couldn’t load").count()) > 0 || (await page.getByRole("alert").filter({ hasText: /fail|error|could not|not load/i }).count()) > 0;
      page.off("console", onConsole);
      if (!ok || broken || problems.length > 0 || errors.length > 0) failures.push(`${path}: heading=${ok} broken=${broken} ${[...problems, ...errors].join(" | ")}`);
    }
    expect(failures, failures.join("\n")).toEqual([]);
  });

  test("writes the Terms as a draft, publishes it, and the public page shows it", async ({ page }) => {
    await login(page, ADMIN, seedPassword());
    const text = `# Terms of E2E ${Date.now().toString(36)}

The text of the test.`;
    await open(page, `${APP}/systemadmin/legal`);
    const area = page.getByTestId("legal-text");
    await expect(area).toBeVisible({ timeout: 90_000 });
    await expect(async () => {
      await area.fill(text);
      await expect(area).toHaveValue(text, { timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await page.getByTestId("legal-save").click();
    await expect(page.getByText(/Draft saved/)).toBeVisible({ timeout: 30_000 });
    await page.getByTestId("legal-publish").click();
    await expect(page.getByText(/Published\./)).toBeVisible({ timeout: 30_000 });
    await open(page, `${APP}/terms`);
    await expect(page.getByText("The text of the test.")).toBeVisible({ timeout: 60_000 });
  });

  test("deactivates a user: the server refuses their login after it", async ({ page, request }) => {
    const email = `to-close-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const made = await request.post(`${APP}/api/v1/auth/signup`, { headers: { origin: APP }, data: { type: "CUSTOMER", email, password: "Real-Stack-Pass-123", confirmPassword: "Real-Stack-Pass-123" } });
    expect(made.status()).toBe(201);
    await login(page, ADMIN, seedPassword());
    await open(page, `${APP}/systemadmin/users`);
    const search = page.getByRole("searchbox").or(page.getByRole("textbox", { name: "Search" })).first();
    await expect(async () => {
      await search.fill(email);
      await expect(page.getByRole("row").filter({ hasText: email })).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });
    await page.getByRole("row").filter({ hasText: email }).getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog").getByRole("textbox").fill("Closed by the e2e test");
    await page.getByRole("dialog").getByRole("button", { name: "Deactivate" }).click();
    await expect.poll(async () => (await request.post(`${APP}/api/v1/auth/login`, { headers: { origin: APP }, data: { email, password: "Real-Stack-Pass-123" } })).status(), { timeout: 30_000 }).toBe(403);
  });

  test("opens the detail of a shop with its fee rates, and lists or hides it for the customers", async ({ page }) => {
    await login(page, ADMIN, seedPassword());
    const api = page.context().request;
    const shops = ((await (await api.get(`${APP}/api/v1/admin/organizations?q=whiskladle`)).json()) as { items: Array<{ id: string; showOnCustomerPage: boolean }> }).items;
    const shop = shops[0]!;
    await open(page, `${APP}/systemadmin/organizations/${shop.id}`);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Whisk", { timeout: 90_000 });
    await expect(page.getByText(/maintenance/i).first()).toBeVisible({ timeout: 30_000 });
    // the list: the button of the shop flips its visibility and flips back
    await open(page, `${APP}/systemadmin/organizations`);
    const row = page.getByRole("row").filter({ hasText: "whiskladle" });
    await expect(row).toBeVisible({ timeout: 60_000 });
    await row.getByRole("button", { name: shop.showOnCustomerPage ? "Hide" : "List" }).click();
    await expect.poll(async () => (((await (await api.get(`${APP}/api/v1/admin/organizations?q=whiskladle`)).json()) as { items: Array<{ showOnCustomerPage: boolean }> }).items[0]!.showOnCustomerPage), { timeout: 30_000 }).toBe(!shop.showOnCustomerPage);
    await row.getByRole("button", { name: shop.showOnCustomerPage ? "List" : "Hide" }).click();
    await expect.poll(async () => (((await (await api.get(`${APP}/api/v1/admin/organizations?q=whiskladle`)).json()) as { items: Array<{ showOnCustomerPage: boolean }> }).items[0]!.showOnCustomerPage), { timeout: 30_000 }).toBe(shop.showOnCustomerPage);
  });
});
