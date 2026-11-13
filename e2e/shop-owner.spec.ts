import { expect, test } from "@playwright/test";
import { APP, demoPassword, login, open, watchBrowser } from "./helpers";

// What a shop owner does every day: looks at the workshops and the bookings, and edits the landing page.
const OWNER = "linh@whiskladle.example";

test.describe("a shop owner", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, OWNER, demoPassword());
  });

  test("sees the bookings of the shop and finds one by its code", async ({ page }) => {
    await open(page, `${APP}/shopowner/whiskladle/bookings`);
    await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible({ timeout: 60_000 });
    const rows = page.getByRole("row");
    await expect(rows.nth(1)).toBeVisible({ timeout: 30_000 }); // a header row and at least one booking
    const first = await rows.nth(1).textContent();
    const code = /SES-\d{4}-\d{3}/.exec(first ?? "")?.[0];
    expect(code, "the first booking shows its code").toBeTruthy();
    await page.getByRole("searchbox").or(page.getByRole("textbox", { name: /search/i })).first().fill(code!);
    await expect(page.getByRole("row").filter({ hasText: code! }).first()).toBeVisible();
  });

  test("opens the landing pages of the shop and the builder with its sections", async ({ page }) => {
    const problems = watchBrowser(page);
    await open(page, `${APP}/shopowner/whiskladle/site`);
    await expect(page.getByRole("heading", { name: "Landing pages", level: 1 })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("2 of 2 landing pages")).toBeVisible(); // the limit of a shop
    await expect(page.getByRole("button", { name: "Create landing page" })).toBeDisabled();
    const published = page.getByRole("listitem").filter({ hasText: "Published" }).first();
    await expect(published.getByRole("button", { name: /^Public now/ })).toBeDisabled(); // the page that is public cannot be made public again
    await page.getByRole("link", { name: /^Edit : Summer Baking Promo/ }).click();
    await page.waitForURL(/\/shopowner\/whiskladle\/site\/p-summer$/, { timeout: 90_000, waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: /Summer Baking Promo/ }).first()).toBeVisible({ timeout: 60_000 });
    expect(problems).toEqual([]);
  });
});
