import { expect, test } from "@playwright/test";
import { APP, login, open, watchBrowser } from "./helpers";

// The shop owner area against the REAL API: what the owner does is kept by the server. Needs the stack of e2e/README.md and E2E_PASSWORD (the password of `pnpm db:seed`).
test.skip(!process.env.E2E_REAL_API, "needs the web app connected to the API (E2E_REAL_API=1)");

const OWNER = "linh@whiskladle.example";
const SLUG = "whiskladle";

test.describe("the shop owner on the real API", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OWNER, process.env.E2E_PASSWORD ?? "");
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
});
