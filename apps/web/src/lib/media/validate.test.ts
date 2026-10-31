import { describe, expect, it } from "vitest";
import { detectImageType, MAX_IMAGE_BYTES, validateImageFile } from "./validate";

const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const file = (bytes: number[], type: string, size?: number) => {
  const blob = new Blob([new Uint8Array(bytes)], { type });
  return size === undefined ? blob : Object.defineProperty(blob, "size", { value: size });
};

describe("detectImageType (magic bytes)", () => {
  it("detects jpeg, png and webp", () => {
    expect(detectImageType(new Uint8Array(JPEG))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array(PNG))).toBe("image/png");
    expect(detectImageType(new Uint8Array(WEBP))).toBe("image/webp");
  });
  it("rejects gif, svg, html, riff-but-not-webp and short input", () => {
    expect(detectImageType(new TextEncoder().encode("GIF89a......"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<svg xmlns=...>"))).toBeNull();
    expect(detectImageType(new TextEncoder().encode("<html><body>"))).toBeNull();
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x41, 0x56, 0x45]))).toBeNull(); // WAVE
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe("validateImageFile", () => {
  it("accepts real images", async () => {
    expect(await validateImageFile(file(JPEG, "image/jpeg"))).toEqual({ ok: true, type: "image/jpeg" });
    expect(await validateImageFile(file(PNG, "image/png"))).toEqual({ ok: true, type: "image/png" });
    expect(await validateImageFile(file(WEBP, "image/webp"))).toEqual({ ok: true, type: "image/webp" });
  });
  it("accepts a real image whose declared type is empty", async () => {
    expect(await validateImageFile(file(PNG, ""))).toEqual({ ok: true, type: "image/png" });
  });
  it("rejects a file renamed to look like an image (declared type ok, bytes not)", async () => {
    expect(await validateImageFile(file([0x3c, 0x73, 0x76, 0x67, 0x3e, 0, 0, 0, 0, 0], "image/png"))).toEqual({ ok: false, error: "unsupportedType" });
  });
  it("rejects a mismatch between declared and real type", async () => {
    expect(await validateImageFile(file(PNG, "image/jpeg"))).toEqual({ ok: false, error: "typeMismatch" });
  });
  it("rejects other declared types even with image bytes", async () => {
    expect(await validateImageFile(file(PNG, "image/gif"))).toEqual({ ok: false, error: "unsupportedType" });
    expect(await validateImageFile(file(PNG, "application/pdf"))).toEqual({ ok: false, error: "unsupportedType" });
  });
  it("rejects empty and oversized files", async () => {
    expect(await validateImageFile(file([], "image/png"))).toEqual({ ok: false, error: "empty" });
    expect(await validateImageFile(file(PNG, "image/png", MAX_IMAGE_BYTES + 1))).toEqual({ ok: false, error: "tooLarge" });
    expect((await validateImageFile(file(PNG, "image/png", MAX_IMAGE_BYTES))).ok).toBe(true);
  });
});
