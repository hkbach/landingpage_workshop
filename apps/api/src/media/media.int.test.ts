import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";

const d = describe.skipIf(!TEST_DATABASE_URL);

// Made-up values: nothing here talks to Cloudflare, the route only signs a URL.
const R2 = {
  R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_ACCESS_KEY_ID: "TESTACCESSKEYID", R2_SECRET_ACCESS_KEY: "test-secret-access-key-not-real", R2_BUCKET: "test-media",
  R2_PUBLIC_BASE_URL: "https://pub-test.r2.dev/",
};

d("upload of images (presigned URL)", () => {
  let t: TestApp;
  let owner: { cookie: string; orgId: string };

  beforeAll(async () => {
    t = await startApp(R2);
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("media"), `Shop ${unique("media")}`));
    owner = { cookie: cookieOf(res), orgId: res.json().organization.id as string };
  });
  afterAll(async () => { await t.close(); });

  it("gives a URL that uploads one image of one type into the folder of the shop, and the address it is read at", async () => {
    const res = await t.post("/media/presign", { purpose: "workshop", contentType: "image/png", size: 123_456 }, { cookie: owner.cookie });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.method).toBe("PUT");
    expect(body.headers).toEqual({ "content-type": "image/png" });
    expect(body.key).toMatch(new RegExp(`^shops/${owner.orgId}/workshop/[0-9a-f-]{36}[.]png$`));
    expect(body.publicUrl).toBe(`https://pub-test.r2.dev/${body.key}`);
    const url = new URL(body.uploadUrl);
    expect(url.host).toBe(`${R2.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`);
    expect(url.pathname).toBe(`/${R2.R2_BUCKET}/${body.key}`);
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(JSON.stringify(body)).not.toContain(R2.R2_SECRET_ACCESS_KEY); // the key itself never goes out
  });

  it("refuses what is not an image of the allowed types and sizes, and needs a shop", async () => {
    const check = async (b: Record<string, unknown>) => (await t.post("/media/presign", b, { cookie: owner.cookie })).json().error?.details?.fields ?? {};
    expect(await check({ purpose: "workshop", contentType: "image/gif", size: 10 })).toHaveProperty("contentType", "unsupportedType");
    expect(await check({ purpose: "workshop", contentType: "image/png", size: 5 * 1024 * 1024 + 1 })).toHaveProperty("size", "tooLarge");
    expect(await check({ purpose: "workshop", contentType: "image/png", size: 0 })).toHaveProperty("size", "invalid");
    expect(await check({ purpose: "secrets", contentType: "image/png", size: 10 })).toHaveProperty("purpose");
    expect((await t.post("/media/presign", { purpose: "workshop", contentType: "image/png", size: 10 }, {})).statusCode).toBe(401);
  });

  it("a suspended shop cannot upload", async () => {
    await t.pool.query("update organizations set status = 'SUSPENDED', status_reason = 'test' where id = $1", [owner.orgId]);
    const res = await t.post("/media/presign", { purpose: "workshop", contentType: "image/png", size: 10 }, { cookie: owner.cookie });
    expect(res.statusCode).toBe(403);
    await t.pool.query("update organizations set status = 'ACTIVE', status_reason = null where id = $1", [owner.orgId]);
  });
});

d("upload of images without the settings of R2", () => {
  it("says the storage is not set up (the pages keep taking a link)", async () => {
    // (the settings of the machine may have R2: they are blanked here)
    const t = await startApp({ R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET: "", R2_PUBLIC_BASE_URL: "" });
    try {
      const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("nomedia"), `Shop ${unique("nomedia")}`));
      const out = await t.post("/media/presign", { purpose: "workshop", contentType: "image/png", size: 10 }, { cookie: cookieOf(res) });
      expect(out.statusCode).toBe(503);
      expect(out.json().error.code).toBe("MEDIA_NOT_CONFIGURED");
    } finally {
      await t.close();
    }
  });
});
