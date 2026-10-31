import { describe, expect, it, vi } from "vitest";
import { MediaUploadError, type MediaUploader } from "./uploader";
import { uploadMany } from "./upload-many";

const f = (name: string) => new File(["x"], name, { type: "image/png" });
const okUploader = (): MediaUploader => ({
  upload: async (file) => ({ id: file.name, url: `https://img.test/${file.name}`, width: 1, height: 1 }),
});

describe("uploadMany", () => {
  it("uploads in selection order", async () => {
    const r = await uploadMany([f("a.png"), f("b.png"), f("c.png")], okUploader(), "site", 12);
    expect(r.urls).toEqual(["https://img.test/a.png", "https://img.test/b.png", "https://img.test/c.png"]);
    expect(r.failed).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it("uploads one at a time (never in parallel)", async () => {
    let active = 0;
    let peak = 0;
    const uploader: MediaUploader = {
      upload: async (file) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((res) => setTimeout(res, 1));
        active--;
        return { id: file.name, url: `https://img.test/${file.name}`, width: 1, height: 1 };
      },
    };
    await uploadMany([f("a.png"), f("b.png"), f("c.png")], uploader, "site", 12);
    expect(peak).toBe(1);
  });

  it("stops at the slot limit and reports the rest as skipped", async () => {
    const r = await uploadMany([f("a.png"), f("b.png"), f("c.png"), f("d.png")], okUploader(), "site", 2);
    expect(r.urls).toHaveLength(2);
    expect(r.skipped).toEqual(["c.png", "d.png"]);
  });

  it("attempts nothing when no slot is left", async () => {
    const upload = vi.fn();
    const r = await uploadMany([f("a.png")], { upload }, "site", 0);
    expect(upload).not.toHaveBeenCalled();
    expect(r.skipped).toEqual(["a.png"]);
    const negative = await uploadMany([f("a.png")], { upload }, "site", -3);
    expect(negative.skipped).toEqual(["a.png"]);
  });

  it("keeps going after a failure and reports the error code per file", async () => {
    const uploader: MediaUploader = {
      upload: async (file) => {
        if (file.name === "bad.png") throw new MediaUploadError("tooLarge");
        if (file.name === "boom.png") throw new Error("network");
        return { id: file.name, url: `https://img.test/${file.name}`, width: 1, height: 1 };
      },
    };
    const r = await uploadMany([f("a.png"), f("bad.png"), f("boom.png"), f("c.png")], uploader, "site", 12);
    expect(r.urls).toEqual(["https://img.test/a.png", "https://img.test/c.png"]);
    expect(r.failed).toEqual([{ name: "bad.png", code: "tooLarge" }, { name: "boom.png", code: "failed" }]);
  });

  it("reports progress after every file, including failures", async () => {
    const seen: [number, number, number][] = [];
    const uploader: MediaUploader = {
      upload: async (file) => {
        if (file.name === "bad.png") throw new MediaUploadError("empty");
        return { id: file.name, url: `https://img.test/${file.name}`, width: 1, height: 1 };
      },
    };
    await uploadMany([f("a.png"), f("bad.png"), f("c.png")], uploader, "site", 12, (d, t, u) => seen.push([d, t, u.length]));
    expect(seen).toEqual([[1, 3, 1], [2, 3, 1], [3, 3, 2]]);
  });
});
