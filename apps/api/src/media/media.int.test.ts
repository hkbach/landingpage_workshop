import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashPassword } from "../auth/crypto";
import { PASSWORD, TEST_DATABASE_URL, cookieOf, emailFor, signupBody, startApp, unique, type TestApp } from "../test/helpers";
import { MediaService } from "./media.service";

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
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;content-type;host"); // (the size is signed: a larger body is refused by the bucket)
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

/** A bucket in memory that answers like R2 to the listing and to the removal of a file (nothing here talks to Cloudflare). */
/** Files uploaded "just now" (the others were uploaded long ago). */
const justUploaded = new Set<string>();

function fakeBucket(files: Map<string, number>): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    if (init?.method === "DELETE") { files.delete(decodeURIComponent(url.pathname.replace(/^\/[^/]+\//, ""))); return new Response(null, { status: 204 }); }
    const prefix = url.searchParams.get("prefix") ?? "";
    const keys = [...files.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = Number(url.searchParams.get("continuation-token") ?? 0);
    const page = keys.slice(start, start + 2); // (two at a time: the listing has to follow the pages)
    const more = start + 2 < keys.length;
    const xml = `<?xml version="1.0"?><ListBucketResult><IsTruncated>${more}</IsTruncated>${more ? `<NextContinuationToken>${start + 2}</NextContinuationToken>` : ""}${page.map((k) => `<Contents><Key>${k}</Key><LastModified>${justUploaded.has(k) ? new Date().toISOString() : "2026-01-05T10:00:00.000Z"}</LastModified><Size>${files.get(k)}</Size></Contents>`).join("")}</ListBucketResult>`;
    return new Response(xml, { status: 200 });
  };
}

d("the images in the storage and the ones nothing shows any more (administrator)", () => {
  let t: TestApp;
  let admin: string;
  let owner: { cookie: string; orgId: string };
  const bucket = new Map<string, number>();
  const uid = () => randomUUID();
  const key = (orgId: string, purpose: string, ext = "webp") => `shops/${orgId}/${purpose}/${uid()}.${ext}`;
  const keys = {} as Record<"cover" | "gallery" | "page" | "version" | "free1" | "free2" | "free3" | "fresh", string>;
  const get = () => t.app.inject({ method: "GET", url: "/api/v1/admin/media", remoteAddress: "10.1.1.1", headers: { cookie: admin } });
  const del = (body: unknown, cookie = admin) => t.post("/admin/media/delete", body, { cookie });

  beforeAll(async () => {
    t = await startApp(R2);
    t.app.get(MediaService, { strict: false }).http = fakeBucket(bucket);
    const email = emailFor("mediaroot");
    await t.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
    admin = cookieOf(await t.post("/auth/login", { email, password: PASSWORD }));
    const res = await t.post("/auth/signup", signupBody("SHOP_OWNER", emailFor("mediashop"), `Shop ${unique("mediashop")}`));
    owner = { cookie: cookieOf(res), orgId: res.json().organization.id as string };
    keys.cover = key(owner.orgId, "workshop"); keys.gallery = key(owner.orgId, "workshop", "png"); keys.page = key(owner.orgId, "site"); keys.version = key(owner.orgId, "site", "jpg");
    keys.free1 = key(owner.orgId, "promotion"); keys.free2 = key(owner.orgId, "session"); keys.free3 = key(owner.orgId, "branding");
    keys.fresh = key(owner.orgId, "workshop"); justUploaded.add(keys.fresh); // uploaded a moment ago, the form maybe not saved yet
    for (const k of Object.values(keys)) bucket.set(k, 1234);
    bucket.set(`shops/${owner.orgId}/notes.txt`, 5); // (not named like ours)
    // what shows an image: a workshop (cover and gallery), the draft of a landing page, and a version kept of it
    const w = await t.post("/workshops", { title: { en: unique("Media") }, durationMinutes: 60, priceAmount: 100_000, defaultCapacity: 10, maxPerBooking: 4, categories: ["COOKING"] }, { cookie: owner.cookie });
    await t.pool.query("update workshops set cover_url = $2, gallery_urls = ARRAY[$3]::text[] where id = $1", [w.json().id, `https://pub-test.r2.dev/${keys.cover}`, `https://pub-test.r2.dev/${keys.gallery}`]);
    const page = await t.post("/site/pages", { name: "Media" }, { cookie: owner.cookie });
    await t.pool.query("update site_pages set draft_content = $2::jsonb where id = $1", [page.json().id, JSON.stringify({ schemaVersion: 1, sections: [{ id: "h", type: "hero", enabled: true, props: { image: `https://pub-test.r2.dev/${keys.page}` } }], seo: { title: {}, description: {} } })]);
    await t.pool.query(
      "insert into site_page_versions (organization_id, page_id, version, template_key, content, theme) values ($1, $2, 1, 'classic', $3::jsonb, '{}'::jsonb)",
      [owner.orgId, page.json().id, JSON.stringify({ schemaVersion: 1, sections: [{ id: "h", type: "hero", enabled: true, props: { image: `https://pub-test.r2.dev/${keys.version}` } }], seo: { title: {}, description: {} } })],
    );
  });
  afterAll(async () => { await t.close(); });

  it("lists every file with the shop and what still shows it: workshops, landing pages and the versions kept of them count; a file of no place is unused", async () => {
    const res = await get();
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<{ key: string; status: string; usedBy: string[]; shopName: string; purpose: string; url: string; size: number }>; total: number; truncated: boolean };
    const byKey = new Map(body.items.map((i) => [i.key, i]));
    expect(body.total).toBe(8); // (the notes.txt that is not named like ours is left out; the listing followed its pages)
    expect(body.truncated).toBe(false);
    expect(byKey.get(keys.cover)).toMatchObject({ status: "USED", usedBy: ["workshop"], purpose: "workshop", size: 1234, url: `https://pub-test.r2.dev/${keys.cover}` });
    expect(byKey.get(keys.gallery)).toMatchObject({ status: "USED", usedBy: ["workshop"] });
    expect(byKey.get(keys.page)).toMatchObject({ status: "USED", usedBy: ["landingPage"] });
    expect(byKey.get(keys.version)).toMatchObject({ status: "USED", usedBy: ["landingPage"] });
    for (const k of [keys.free1, keys.free2, keys.free3]) expect(byKey.get(k)).toMatchObject({ status: "UNUSED", usedBy: [] });
    expect(byKey.get(keys.fresh)).toMatchObject({ status: "USED", usedBy: ["recentUpload"] }); // not offered for deletion yet
    expect(byKey.get(keys.free1)!.shopName).toMatch(/^Shop /);
  });

  it("is for the platform administrator only", async () => {
    expect((await t.app.inject({ method: "GET", url: "/api/v1/admin/media", remoteAddress: "10.1.1.1" })).statusCode).toBe(401);
    expect((await t.app.inject({ method: "GET", url: "/api/v1/admin/media", remoteAddress: "10.1.1.1", headers: { cookie: owner.cookie } })).statusCode).toBe(403);
    expect((await del({ keys: [keys.free1] }, owner.cookie)).statusCode).toBe(403);
    expect(bucket.has(keys.free1)).toBe(true);
  });

  it("removes unused files from the bucket and audits each; a file that is in use is never removed, even when the request names it", async () => {
    const res = await del({ keys: [keys.free1, keys.free2, keys.cover, keys.version, keys.fresh], reason: "clean up" });
    expect(res.statusCode).toBe(200);
    const out = res.json() as { deleted: string[]; inUse: string[]; failed: string[] };
    expect(out.deleted.sort()).toEqual([keys.free1, keys.free2].sort());
    expect(out.inUse.sort()).toEqual([keys.cover, keys.version, keys.fresh].sort()); // (the one uploaded a moment ago too)
    expect(out.failed).toEqual([]);
    expect(bucket.has(keys.free1)).toBe(false);
    expect(bucket.has(keys.free2)).toBe(false);
    expect(bucket.has(keys.cover)).toBe(true);
    expect(bucket.has(keys.version)).toBe(true);
    expect(bucket.has(keys.fresh)).toBe(true);
    const audit = await t.pool.query<{ entity_id: string; organization_id: string; after: { reason: string } }>("select entity_id, organization_id, after from audit_logs where action = 'media.delete' and entity_type = 'media' and entity_id = any($1)", [[keys.free1, keys.free2, keys.cover]]);
    expect(audit.rows.map((r) => r.entity_id).sort()).toEqual([keys.free1, keys.free2].sort());
    expect(audit.rows[0]).toMatchObject({ organization_id: owner.orgId, after: { reason: "clean up" } });
  });

  it("says which files could not be removed (the bucket refused)", async () => {
    const media = t.app.get(MediaService, { strict: false });
    const normal = media.http;
    media.http = async (input, init) => (init?.method === "DELETE" ? new Response("denied", { status: 403 }) : normal(input, init)); // (the listing still works, the removal is refused)
    try {
      const out = (await del({ keys: [keys.free3] })).json() as { deleted: string[]; failed: string[] };
      expect(out).toMatchObject({ deleted: [], failed: [keys.free3] });
    } finally {
      media.http = normal;
    }
    expect(bucket.has(keys.free3)).toBe(true);
  });

  it("refuses a name that is not one of our files, nothing, and more than a hundred", async () => {
    expect((await del({ keys: ["shops/x/../../etc/passwd"] })).statusCode).toBe(422);
    expect((await del({ keys: [`shops/${owner.orgId}/notes.txt`] })).statusCode).toBe(422);
    expect((await del({ keys: [] })).statusCode).toBe(422);
    expect((await del({ keys: Array.from({ length: 101 }, () => key(owner.orgId, "site")) })).statusCode).toBe(422);
    expect(bucket.has(`shops/${owner.orgId}/notes.txt`)).toBe(true);
  });

  it("says so when the bucket does not answer, and when the storage is not set up", async () => {
    const media = t.app.get(MediaService, { strict: false });
    const normal = media.http;
    media.http = async () => { throw new Error("network down https://secret-signed-url"); };
    try {
      const res = await get();
      expect(res.statusCode).toBe(502);
      expect(res.json().error.code).toBe("MEDIA_STORAGE_ERROR");
      expect(res.body).not.toContain("secret-signed-url");
    } finally {
      media.http = normal;
    }
    const none = await startApp({ R2_ACCOUNT_ID: "", R2_ACCESS_KEY_ID: "", R2_SECRET_ACCESS_KEY: "", R2_BUCKET: "", R2_PUBLIC_BASE_URL: "" });
    try {
      const email = emailFor("mediaroot2");
      await none.pool.query("insert into users (email, password_hash, full_name, status, platform_role) values ($1, $2, 'Root', 'ACTIVE', 'SUPER_ADMIN')", [email, await hashPassword(PASSWORD)]);
      const cookie = cookieOf(await none.post("/auth/login", { email, password: PASSWORD }));
      const res = await none.app.inject({ method: "GET", url: "/api/v1/admin/media", remoteAddress: "10.1.1.1", headers: { cookie } });
      expect(res.statusCode).toBe(503);
      expect(res.json().error.code).toBe("MEDIA_NOT_CONFIGURED");
    } finally {
      await none.close();
    }
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
