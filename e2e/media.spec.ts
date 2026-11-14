import { expect, test } from "@playwright/test";
import { APP, login, open, seedPassword, watchBrowser } from "./helpers";

// The upload of an image against the REAL storage (Cloudflare R2): the browser asks the API for a presigned URL, PUTs the file to the bucket, and the public address answers with that image.
// Needs the five R2_* variables in apps/api/.env, MEDIA_UPLOAD_ORIGIN for the web server, the CORS policy of the bucket for the origin of the app (`pnpm --filter api r2:check` says if it is set), and
// the app on that origin (E2E_PORT=3000 for http://app.localtest.me:3000). Without the storage the test is skipped.
const OWNER = "linh@whiskladle.example";
const SLUG = "whiskladle";
const ADMIN = "admin@workshopkit.example";
// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

test("an image just uploaded is protected: the bucket refuses a larger body than signed, and the Images page keeps a fresh upload out of the deletable ones", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const adminCtx = await browser.newContext();
  try {
    const ownerPage = await ownerCtx.newPage();
    await login(ownerPage, OWNER, seedPassword());
    const presign = await ownerCtx.request.post(`${APP}/api/v1/media/presign`, { headers: { origin: APP }, data: { purpose: "workshop", contentType: "image/png", size: PNG.length } });
    test.skip(presign.status() === 503, "the image storage is not set up (R2_* in apps/api/.env)");
    expect(presign.ok()).toBe(true);
    const target = (await presign.json()) as { key: string; uploadUrl: string; headers: Record<string, string> };
    // the size is part of the signature: a larger body is refused by the bucket, the declared one is taken
    expect((await ownerCtx.request.put(target.uploadUrl, { headers: target.headers, data: Buffer.concat([PNG, PNG]) })).ok()).toBe(false);
    expect((await ownerCtx.request.put(target.uploadUrl, { headers: target.headers, data: PNG })).ok()).toBe(true);
    const name = target.key.split("/").pop()!;

    const page = await adminCtx.newPage();
    await login(page, ADMIN, seedPassword());
    const problems = watchBrowser(page);
    const listed = async () => ((await (await adminCtx.request.get(`${APP}/api/v1/admin/media`)).json()) as { items: Array<{ key: string; status: string; usedBy: string[] }> }).items.find((i) => i.key === target.key);
    // nothing shows it, but it was uploaded a moment ago (the owner may not have saved the form yet): in use, not offered for deletion
    expect(await listed()).toMatchObject({ status: "USED", usedBy: ["recentUpload"] });

    await open(page, `${APP}/systemadmin/media`);
    await page.getByTestId("media-tab-unused").click();
    await page.getByRole("searchbox").fill(name);
    await expect(page.getByTestId("media-table")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("media-select")).toHaveCount(0);
    await page.getByTestId("media-tab-used").click();
    await expect(page.getByTestId("media-table").getByText("Uploaded in the last 24 hours")).toHaveCount(1, { timeout: 60_000 });

    // and the server keeps it even when asked to delete it
    const out = await adminCtx.request.post(`${APP}/api/v1/admin/media/delete`, { headers: { origin: APP }, data: { keys: [target.key], reason: "e2e" } });
    expect(await out.json()).toMatchObject({ deleted: [], inUse: [target.key] });
    expect(problems).toEqual([]);
  } finally {
    await ownerCtx.close();
    await adminCtx.close();
  }
});

test("uploads a cover image to Cloudflare R2 from the workshop form, and the public address serves it", async ({ page, request }) => {
  await login(page, OWNER, seedPassword());
  const probe = await page.context().request.post(`${APP}/api/v1/media/presign`, { headers: { origin: APP }, data: { purpose: "workshop", contentType: "image/webp", size: 1000 } });
  test.skip(probe.status() === 503, "the image storage is not set up (R2_* in apps/api/.env)");
  expect(probe.ok()).toBe(true);

  const problems = watchBrowser(page);
  const failures: string[] = [];
  page.on("requestfailed", (r) => { if (r.url().includes("r2.cloudflarestorage.com")) failures.push(`${r.method()} failed: ${r.failure()?.errorText}`); });
  const puts: number[] = [];
  page.on("response", (r) => { if (r.request().method() === "PUT" && r.url().includes("r2.cloudflarestorage.com")) puts.push(r.status()); });

  await open(page, `${APP}/shopowner/${SLUG}/workshops`);
  await page.getByTestId("new-workshop-button").click();
  const dialog = page.getByRole("dialog");
  const file = dialog.locator("#ws-cover-file");
  await expect(async () => {
    await file.setInputFiles({ name: "cover.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.locator("#ws-cover")).toHaveValue(/^https:\/\/.+\/shops\/.+\.(webp|jpg|jpeg)$/, { timeout: 15_000 });
  }).toPass({ timeout: 60_000 });

  const url = await dialog.locator("#ws-cover").inputValue();
  expect(failures).toEqual([]);
  expect(puts).toEqual([200]);
  const read = await request.get(url);
  expect(read.status()).toBe(200);
  expect(read.headers()["content-type"]).toMatch(/^image\//);
  expect(problems).toEqual([]);
});
