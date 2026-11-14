import { describe, expect, it } from "vitest";
import { collectImages, copyImage, isExternalImage, rewriteImages, type Io } from "./mirror-images";
import { MediaService } from "./media.service";
import { parseEnv } from "../config/env";

const BASE = "https://pub-test.r2.dev";
const ENV = parseEnv({ DATABASE_URL: "postgres://u:p@localhost:5432/x", R2_ACCOUNT_ID: "0123456789abcdef0123456789abcdef", R2_ACCESS_KEY_ID: "TESTACCESSKEYID", R2_SECRET_ACCESS_KEY: "test-secret-access-key-not-real", R2_BUCKET: "test-media", R2_PUBLIC_BASE_URL: `${BASE}/` });

describe("mirror of the images of other websites to our bucket", () => {
  it("knows an image of another website from one of ours and from a plain link", () => {
    expect(isExternalImage("https://images.unsplash.com/photo-1?w=1", BASE)).toBe(true);
    expect(isExternalImage(`${BASE}/shops/x/site/y.jpg`, BASE)).toBe(false);
    expect(isExternalImage("http://insecure.example/a.jpg", BASE)).toBe(false);
    expect(isExternalImage("", BASE)).toBe(false);
  });

  it("finds the images of a page by the name of the field, and never a map or a social link", () => {
    const page = {
      sections: [
        { type: "hero", props: { imageUrl: "https://img.example/a.jpg", ctaText: { en: "Book" } } },
        { type: "gallery", props: { imageUrls: ["https://img.example/b.jpg", `${BASE}/shops/x/site/c.jpg`] } },
        { type: "location", props: { mapsUrl: "https://www.google.com/maps/place/x" } },
        { type: "footer", props: { socials: [{ label: "Instagram", url: "https://www.instagram.com/x" }] } },
      ],
    };
    expect([...collectImages(page, BASE)].sort()).toEqual(["https://img.example/a.jpg", "https://img.example/b.jpg"]);
  });

  it("rewrites the addresses in a copy and leaves everything else as it was", () => {
    const page = { a: { imageUrl: "https://img.example/a.jpg", url: "https://img.example/a.jpg" }, imageUrls: ["https://img.example/a.jpg", "https://img.example/z.jpg"] };
    const out = rewriteImages(page, new Map([["https://img.example/a.jpg", `${BASE}/new.jpg`]]));
    expect(out).toEqual({ a: { imageUrl: `${BASE}/new.jpg`, url: "https://img.example/a.jpg" }, imageUrls: [`${BASE}/new.jpg`, "https://img.example/z.jpg"] });
    expect(page.a.imageUrl).toBe("https://img.example/a.jpg");
  });

  it("copies an image into the folder of its owner and gives the new address; refuses what is not an image or is too large", async () => {
    const media = new MediaService(ENV);
    const sent: Array<{ url: string; headers: Record<string, string>; size: number }> = [];
    const io = (contentType: string | null, size: number): Io => ({
      download: async () => ({ body: new Uint8Array(size), contentType }),
      upload: async (url, headers, body) => { sent.push({ url, headers, size: body.byteLength }); return true; },
    });
    const shopId = "11111111-1111-4111-8111-111111111111";
    const got = await copyImage(media, io("image/jpeg", 1000), { owner: { kind: "shop", id: shopId, purpose: "workshop" }, url: "https://img.example/a" });
    expect(got).toMatch(new RegExp(`^${BASE}/shops/${shopId}/workshop/[0-9a-f-]{36}[.]jpg$`));
    expect(sent[0]).toMatchObject({ headers: { "content-type": "image/jpeg" }, size: 1000 });
    expect(sent[0]!.url).toContain("X-Amz-Signature");
    const acc = "22222222-2222-4222-8222-222222222222";
    expect(await copyImage(media, io("image/webp; charset=x", 10), { owner: { kind: "account", id: acc }, url: "https://img.example/b" })).toMatch(new RegExp(`^${BASE}/avatars/${acc}/[0-9a-f-]{36}[.]webp$`));
    expect(await copyImage(media, io("text/html", 10), { owner: { kind: "account", id: acc }, url: "https://img.example/c" })).toBeNull();
    expect(await copyImage(media, io("image/png", 6 * 1024 * 1024), { owner: { kind: "account", id: acc }, url: "https://img.example/d" })).toBeNull();
    expect(await copyImage(media, io("image/png", 0), { owner: { kind: "account", id: acc }, url: "https://img.example/e" })).toBeNull();
    expect(await copyImage(media, { download: async () => null, upload: async () => true }, { owner: { kind: "account", id: acc }, url: "https://img.example/f" })).toBeNull();
    expect(await copyImage(media, { download: async () => ({ body: new Uint8Array(5), contentType: "image/png" }), upload: async () => false }, { owner: { kind: "account", id: acc }, url: "https://img.example/g" })).toBeNull();
  });
});
