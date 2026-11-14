import { expect, test } from "@playwright/test";
import { APP, open, watchBrowser } from "./helpers";

// The customer area against the REAL API (an account made through the API, the session in the browser). Needs the stack of e2e/README.md.
test.skip(!process.env.E2E_REAL_API, "needs the web app connected to the API (E2E_REAL_API=1)");

const PASSWORD = "Real-Stack-Pass-123";

test.describe("a customer on the real API", () => {
  test("opens every page of their area, and a favorite is kept by the server", async ({ page }) => {
    test.setTimeout(300_000);
    const problems = watchBrowser(page);
    const api = page.context().request; // (it carries the session of the account made below)
    const email = `cust-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const signup = await api.post(`${APP}/api/v1/auth/signup`, { headers: { origin: APP }, data: { type: "CUSTOMER", email, password: PASSWORD, confirmPassword: PASSWORD } });
    expect(signup.status()).toBe(201);
    const { id } = (await signup.json()) as { id: string };

    for (const path of ["today", "bookings", "workshops", "favorites", "referrals", "affiliate", "profile"]) {
      await open(page, `${APP}/customer/${id}/${path}`);
      await expect(page.getByRole("main").or(page.locator("main")).first(), path).toBeVisible({ timeout: 90_000 });
      await expect(page.getByRole("heading", { level: 1 }).first(), path).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText("This page couldn’t load"), path).toHaveCount(0);
    }

    // a heart on the Workshops page saves the workshop on the server
    await open(page, `${APP}/customer/${id}/workshops`);
    const card = page.locator("li[data-testid^='customer-workshop-']").first();
    await expect(card).toBeVisible({ timeout: 90_000 });
    await card.getByRole("button", { name: /favorite/i }).first().click();
    await expect.poll(async () => ((await (await api.get(`${APP}/api/v1/customer/${id}/favorites`)).json()) as { total: number }).total, { timeout: 30_000 }).toBe(1);
    await open(page, `${APP}/customer/${id}/favorites`);
    await expect(page.locator("li[data-testid^='customer-workshop-']")).toHaveCount(1, { timeout: 60_000 });

    // an affiliate link of a workshop: made on the server, listed in the Affiliate area with what it earned (nothing yet)
    const programs = ((await (await api.get(`${APP}/api/v1/customer/${id}/referrals`)).json()) as { programs: Array<{ workshopId: string }> }).programs;
    expect(programs.length).toBeGreaterThan(0);
    const made = await api.post(`${APP}/api/v1/customer/${id}/referrals`, { headers: { origin: APP }, data: { workshopId: programs[0]!.workshopId } });
    expect([200, 201]).toContain(made.status());
    await open(page, `${APP}/customer/${id}/affiliate`);
    await page.getByTestId("affiliate-tab-links").click();
    await expect(page.getByTestId("affiliate-link-earned").first()).toBeVisible({ timeout: 60_000 });
    expect(problems).toEqual([]);
  });
});
