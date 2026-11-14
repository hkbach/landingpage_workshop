import { expect, test } from "@playwright/test";
import { APP, SHOP, open, watchBrowser } from "./helpers";

// Accounts against the REAL API (the web app started with API_URL, the API with APP_URL of this test's address, Postgres and Mailpit running). Skipped otherwise:
//   E2E_REAL_API=1 E2E_PORT=3200 pnpm exec playwright test e2e/real-auth.spec.ts      (see e2e/README.md)
const PASSWORD = "Real-Stack-Pass-123";
const newEmail = () => `e2e-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;

test.describe("accounts on the real API", () => {
  test("a customer signs up with the box of the Terms, lands in their area, logs out, and the area is closed again", async ({ page }) => {
    const problems = watchBrowser(page);
    const email = newEmail();
    await open(page, `${APP}/?auth=signup`);
    const dialog = page.getByRole("dialog", { name: "Create your account" });
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
    await dialog.getByRole("textbox", { name: "Re-enter password" }).fill(PASSWORD);

    // no account without the box
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog.getByText("You must accept the Terms and Privacy Policy to continue.")).toBeVisible();
    await expect(page).not.toHaveURL(/\/customer\//);

    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/customer\/[0-9a-f-]{36}\/today/, { timeout: 90_000, waitUntil: "domcontentloaded" });
    const area = page.url().replace(/\/today.*/, "");

    // the session is ended on the server: the area is closed even when the person types its address
    await page.context().request.post(`${APP}/api/v1/auth/logout`, { headers: { origin: APP } });
    await open(page, `${area}/today`);
    await expect(page).toHaveURL(/auth=login/, { timeout: 60_000 }); // (/login opens the popup of the public site)
    expect(problems).toEqual([]);
  });

  test("a visitor of a shop page registers as a customer from the Register button: no shop owner tab, and the new account lands in the customer area", async ({ page }) => {
    const problems = watchBrowser(page);
    const email = newEmail();
    await open(page, `${SHOP}/`);
    const register = page.getByTestId("site-register").first();
    await expect(register).toBeVisible({ timeout: 90_000 });
    await register.click();
    await page.waitForURL(/app\.localtest\.me:\d+\/\?auth=signup/, { timeout: 60_000, waitUntil: "domcontentloaded" });
    const dialog = page.getByRole("dialog", { name: "Create your account" });
    await expect(dialog.getByTestId("signup-customer-only")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("signup-tab-owner")).toHaveCount(0); // (this button is for customers; a shop owner signs up from the home page)
    await dialog.getByRole("textbox", { name: "Email" }).fill(email);
    await dialog.getByRole("textbox", { name: "Password", exact: true }).fill(PASSWORD);
    await dialog.getByRole("textbox", { name: "Re-enter password" }).fill(PASSWORD);
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/customer\/[0-9a-f-]{36}\/today/, { timeout: 90_000, waitUntil: "domcontentloaded" });
    const account = await page.context().request.get(`${APP}/api/v1/auth/me`);
    expect(account.ok()).toBe(true);
    expect(((await account.json()) as { type: string }).type).toBe("CUSTOMER");
    expect(problems).toEqual([]);
  });

  test("the Log in button of a shop page opens the log in popup of the platform", async ({ page }) => {
    await open(page, `${SHOP}/`);
    const login = page.getByTestId("site-login").first();
    await expect(login).toBeVisible({ timeout: 90_000 });
    await login.click();
    await page.waitForURL(/app\.localtest\.me:\d+\/\?auth=login/, { timeout: 60_000, waitUntil: "domcontentloaded" });
    await expect(page.getByRole("dialog", { name: "Log in" })).toBeVisible({ timeout: 60_000 });
  });

  test("a wrong password is refused with the same message for any email", async ({ page }) => {
    await open(page, `${APP}/?auth=login`);
    const dialog = page.getByRole("dialog", { name: "Log in" });
    await dialog.getByRole("textbox", { name: "Email" }).fill(newEmail());
    await dialog.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
    await dialog.getByRole("button", { name: "Log in" }).click();
    await expect(dialog.getByRole("alert")).toContainText(/wrong/i);
  });

  test("a customer cannot open the shop owner area or the admin area", async ({ page }) => {
    const email = newEmail();
    const signup = await page.context().request.post(`${APP}/api/v1/auth/signup`, { headers: { origin: APP }, data: { type: "CUSTOMER", email, password: PASSWORD, confirmPassword: PASSWORD } });
    expect(signup.status()).toBe(201);
    const { id } = (await signup.json()) as { id: string };
    for (const path of ["/shopowner/whiskladle", "/systemadmin"]) {
      await open(page, `${APP}${path}`);
      await expect(page, path).toHaveURL(new RegExp(`/customer/${id}/today`), { timeout: 60_000 });
    }
  });
});
