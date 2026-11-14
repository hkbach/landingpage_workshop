import { describe, expect, it } from "vitest";
import { createR2Uploader } from "./r2-uploader";
import { MediaUploadError } from "./uploader";

// A real PNG header, so the check of the first bytes passes.
const png = () => new File([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], "a.png", { type: "image/png" });
const prepared = { blob: new Blob([new Uint8Array(1000)], { type: "image/webp" }), width: 800, height: 600 };
const answer = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });
const target = { key: "shops/x/workshop/1.webp", uploadUrl: "https://acct.r2.cloudflarestorage.com/b/shops/x/workshop/1.webp?sig", headers: { "content-type": "image/webp" }, publicUrl: "https://pub.r2.dev/shops/x/workshop/1.webp" };

describe("the R2 uploader", () => {
  it("asks for a URL with the type and the size of the file that will be sent, uploads it there, and gives the public address", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const up = createR2Uploader({
      prepare: async () => prepared,
      fetchImpl: async (url, init) => { calls.push({ url: String(url), init }); return String(url).endsWith("/presign") ? answer(200, target) : answer(200); },
    });
    const media = await up.upload(png(), "workshop");
    expect(media).toEqual({ id: target.key, url: target.publicUrl, width: 800, height: 600 });
    expect(calls[0]!.url).toBe("/api/v1/media/presign");
    expect(JSON.parse(String(calls[0]!.init!.body))).toEqual({ purpose: "workshop", contentType: "image/webp", size: 1000 });
    expect(calls[1]!.url).toBe(target.uploadUrl);
    expect(calls[1]!.init!.method).toBe("PUT");
    expect(calls[1]!.init!.headers).toEqual({ "content-type": "image/webp" });
  });

  it("refuses a file that is not an image before anything leaves the browser", async () => {
    let called = false;
    const up = createR2Uploader({ prepare: async () => prepared, fetchImpl: async () => { called = true; return answer(200); } });
    await expect(up.upload(new File(["hello"], "a.png", { type: "image/png" }), "site")).rejects.toMatchObject({ code: "unsupportedType" });
    expect(called).toBe(false);
  });

  it("says so when the storage is not set up, when the file is too large for the server, and when the upload fails", async () => {
    const run = (presign: Response, put: Response = answer(200)) => createR2Uploader({ prepare: async () => prepared, fetchImpl: async (url) => (String(url).endsWith("/presign") ? presign : put) }).upload(png(), "site");
    await expect(run(answer(503, { error: { code: "MEDIA_NOT_CONFIGURED" } }))).rejects.toMatchObject({ code: "notConfigured" });
    await expect(run(answer(422, { error: {} }))).rejects.toMatchObject({ code: "tooLarge" });
    await expect(run(answer(500))).rejects.toBeInstanceOf(MediaUploadError);
    await expect(run(answer(200, target), answer(403))).rejects.toMatchObject({ code: "failed" });
  });
});
