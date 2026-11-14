import { expect, test } from "@playwright/test";
import { acceptLegal, APP, open, seedPassword, watchBrowser } from "./helpers";

// The customer area against the REAL API (an account made through the API, the session in the browser). Needs the stack of e2e/README.md.
const PASSWORD = "Real-Stack-Pass-123";
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test.describe("a customer on the real API", () => {
  test("opens every page of their area, and a favorite is kept by the server", async ({ page }) => {
    test.setTimeout(300_000);
    const problems = watchBrowser(page);
    const api = page.context().request; // (it carries the session of the account made below)
    const email = `cust-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const signup = await api.post(`${APP}/api/v1/auth/signup`, { headers: { origin: APP }, data: { type: "CUSTOMER", email, password: PASSWORD, confirmPassword: PASSWORD } });
    expect(signup.status()).toBe(201);
    const { id } = (await signup.json()) as { id: string };
    await acceptLegal(api); // (a published Terms stands in front of the area until the account agrees)

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

  test("uploads a photo from the profile to Cloudflare R2: the address is in the avatars folder of the account, the bucket serves it, and Remove clears it", async ({ page }) => {
    test.setTimeout(180_000);
    const problems = watchBrowser(page);
    const api = page.context().request;
    const email = `avatar-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const signup = await api.post(`${APP}/api/v1/auth/signup`, { headers: { origin: APP }, data: { type: "CUSTOMER", email, password: PASSWORD, confirmPassword: PASSWORD } });
    expect(signup.status()).toBe(201);
    const { id } = (await signup.json()) as { id: string };
    await acceptLegal(api);
    await open(page, `${APP}/customer/${id}/profile`);
    await expect(page.getByTestId("avatar-upload")).toBeVisible({ timeout: 90_000 });
    await expect(page.getByTestId("avatar-upload").locator("[data-kind='initials']")).toBeVisible();
    // (the page is hydrated after it is shown: choose the file again until the picture appears)
    await expect(async () => {
      await page.getByTestId("avatar-file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: PNG });
      await expect(page.getByTestId("avatar-upload").locator("[data-kind='image'] img")).toBeVisible({ timeout: 15_000 });
    }).toPass({ timeout: 90_000 });
    const src = (await page.getByTestId("avatar-upload").locator("img").first().getAttribute("src")) ?? "";
    expect(src).toMatch(new RegExp(`/avatars/${id}/[0-9a-f-]{36}[.](webp|jpg)$`));
    expect((await api.get(src)).ok()).toBe(true);
    await page.getByRole("button", { name: /Remove photo/ }).click();
    await expect(page.getByTestId("avatar-upload").locator("[data-kind='initials']")).toBeVisible();
    expect(problems).toEqual([]);
  });

  test("is asked to agree to the published Terms before going on, and then the area opens", async ({ page, request }) => {
    // the platform administrator publishes the Terms as a major change (everybody must agree)
    const admin = await request.post(`${APP}/api/v1/auth/login`, { headers: { origin: APP }, data: { email: "admin@workshopkit.example", password: seedPassword() } });
    expect(admin.status()).toBe(200);
    const text = `# Terms of the consent test ${Date.now().toString(36)}

What the customer agrees to.`;
    expect((await request.put(`${APP}/api/v1/admin/legal/terms`, { headers: { origin: APP }, data: { locale: "en", content: text } })).status()).toBe(200);
    expect((await request.post(`${APP}/api/v1/admin/legal/terms/publish`, { headers: { origin: APP }, data: { locale: "en", major: true } })).status()).toBe(200);

    const api = page.context().request;
    const email = `consent-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const signup = await api.post(`${APP}/api/v1/auth/signup`, { headers: { origin: APP }, data: { type: "CUSTOMER", email, password: PASSWORD, confirmPassword: PASSWORD } });
    expect(signup.status()).toBe(201);
    const { id } = (await signup.json()) as { id: string };
    await open(page, `${APP}/customer/${id}/today`);
    const dialog = page.getByTestId("consent-dialog");
    await expect(dialog).toBeVisible({ timeout: 90_000 });
    await expect(dialog.getByTestId("consent-accept")).toBeDisabled(); // not before the box is ticked
    await expect(async () => {
      await dialog.getByTestId("consent-checkbox").click();
      await expect(dialog.getByTestId("consent-accept")).toBeEnabled({ timeout: 1_000 });
    }).toPass({ timeout: 30_000 });
    await dialog.getByTestId("consent-accept").click();
    await expect(dialog).toHaveCount(0, { timeout: 30_000 });
    const status = (await (await api.get(`${APP}/api/v1/legal/consent?locale=en`)).json()) as { mustAcceptAny: boolean };
    expect(status.mustAcceptAny).toBe(false);
  });
});
