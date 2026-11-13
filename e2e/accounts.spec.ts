import { expect, test } from "@playwright/test";
import { APP, demoPassword, login, open, watchBrowser } from "./helpers";

// Signing up, logging in and the areas of a shop owner, a customer and the platform administrator.
const OWNER = "linh@whiskladle.example";
const unique = (label: string): string => `${label}.${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}@example.test`;

test.describe("logging in", () => {
  test("refuses a wrong password and says so, and lets the shop owner in with the right one", async ({ page }) => {
    const problems = watchBrowser(page);
    await open(page, `${APP}/?auth=login`);
    const dialog = page.getByRole("dialog", { name: "Log in" });
    await dialog.getByRole("textbox", { name: "Email" }).fill(OWNER);
    await dialog.getByRole("textbox", { name: "Password" }).fill("not-the-password-1");
    await dialog.getByRole("button", { name: "Log in" }).click();
    await expect(dialog).toBeVisible(); // still here: nobody was let in
    await expect(page).not.toHaveURL(/\/shopowner/);

    await login(page, OWNER, demoPassword());
    await expect(page).toHaveURL(/\/shopowner\/whiskladle$/);
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Key numbers" })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("a shop owner moves around the dashboard and logs out", async ({ page }) => {
    await login(page, OWNER, demoPassword());
    const nav = page.getByRole("navigation", { name: "Dashboard navigation" });
    for (const [link, heading] of [["Bookings", "Bookings"], ["Workshops", "Workshops"], ["Sessions", "Sessions"], ["Promotions", "Promotion management"], ["Settings", "Settings"]] as const) {
      await nav.getByRole("link", { name: link, exact: true }).click();
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible({ timeout: 60_000 });
    }
    await page.getByRole("link", { name: "Log out" }).click();
    await expect(page).toHaveURL(/\/login|\/\?auth=login|\/$/, { timeout: 30_000 });
  });
});

test.describe("signing up", () => {
  test("a customer creates an account with a password of 10 characters or more and lands in their own area", async ({ page }) => {
    await open(page, `${APP}/?auth=signup`);
    const dialog = page.getByRole("dialog", { name: "Create your account" });
    await dialog.getByRole("textbox", { name: "Email" }).fill(unique("customer"));
    await dialog.getByRole("textbox", { name: "Password", exact: true }).fill("short");
    await dialog.getByRole("textbox", { name: "Re-enter password" }).fill("short");
    await dialog.getByRole("button", { name: "Create account" }).click();
    await expect(dialog.getByRole("alert").first()).toBeVisible(); // too short: refused

    const password = "A-long-enough-password-1";
    await dialog.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await dialog.getByRole("textbox", { name: "Re-enter password" }).fill(password);
    await dialog.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/customer\//, { timeout: 90_000, waitUntil: "domcontentloaded" });
  });

  test("a shop owner opens a shop: its address comes from its name, and the setup wizard follows", async ({ page }) => {
    await open(page, `${APP}/?auth=signup`);
    const dialog = page.getByRole("dialog", { name: "Create your account" });
    await dialog.getByRole("tab", { name: "Shop owner" }).click();
    await dialog.getByRole("textbox", { name: "Shop name" }).fill(`E2E Pottery ${Date.now().toString(36)}`);
    await dialog.getByRole("textbox", { name: "Email" }).fill(unique("owner"));
    const password = "A-long-enough-password-1";
    await dialog.getByRole("textbox", { name: "Password", exact: true }).fill(password);
    await dialog.getByRole("textbox", { name: "Re-enter password" }).fill(password);
    await dialog.getByRole("button", { name: "Create account" }).click();
    await page.waitForURL(/\/shopowner\/onboarding\?shop=e2e-pottery-/, { timeout: 90_000, waitUntil: "domcontentloaded" });
  });
});

test.describe("the platform administrator", () => {
  test("sees the list of shops, and the shop of the sample data is in it", async ({ page }) => {
    const problems = watchBrowser(page);
    await open(page, `${APP}/systemadmin`);
    await page.waitForURL(/\/systemadmin\/organizations/, { timeout: 90_000, waitUntil: "domcontentloaded" });
    const nav = page.getByRole("navigation", { name: "Admin navigation" });
    await expect(nav.getByRole("link", { name: "Shops", exact: true })).toBeVisible();
    await expect(page.getByText("Whisk & Ladle Kitchen").first()).toBeVisible();
    for (const area of ["Users", "Settings"]) await expect(nav.getByRole("link", { name: area, exact: true })).toBeVisible();
    expect(problems).toEqual([]);
  });
});
