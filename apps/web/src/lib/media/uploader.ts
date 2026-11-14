import { validateImageFile, type ImageErrorCode } from "./validate";
import { newUuid } from "@/lib/uuid";

// Media upload seam (FR-MEDIA-01). `mediaUploader` (r2-uploader.ts) checks and shrinks the image in the browser, asks the API for a presigned URL and PUTs the file to Cloudflare R2; it returns the
// public https address. The mock below (a data: URL, nothing leaves the browser) is kept for tests. UI code only depends on this interface.

export type UploadPurpose = "site" | "workshop" | "branding" | "session" | "promotion" | "avatar";
export interface UploadedMedia { id: string; url: string; width: number; height: number }

export interface MediaUploader {
  upload(file: File, purpose: UploadPurpose): Promise<UploadedMedia>;
}

export type UploadErrorCode = ImageErrorCode | "decodeFailed" | "storageFull" | "notConfigured" | "failed";
export class MediaUploadError extends Error {
  constructor(readonly code: UploadErrorCode) {
    super(code);
    this.name = "MediaUploadError";
  }
}

export const MAX_EDGE = 1600;
const MAX_DATA_URL_CHARS = 700_000; // keeps several images inside the ~5 MB localStorage budget

export async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bmp = await createImageBitmap(file);
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", quality);
}

/** Probe whether localStorage can still hold a value of this size (the draft is autosaved there). */
function fitsInStorage(value: string): boolean {
  const key = "builder:quota-probe";
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  } finally {
    try { window.localStorage.removeItem(key); } catch { /* ignore */ }
  }
}

export const mockMediaUploader: MediaUploader = {
  async upload(file) {
    const check = await validateImageFile(file);
    if (!check.ok) throw new MediaUploadError(check.error);

    let decoded;
    try {
      decoded = await decode(file);
    } catch {
      throw new MediaUploadError("decodeFailed");
    }
    try {
      const scale = Math.min(1, MAX_EDGE / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new MediaUploadError("failed");
      ctx.drawImage(decoded.source, 0, 0, width, height);

      let url = "";
      for (const q of [0.82, 0.7, 0.55]) {
        url = encode(canvas, q);
        if (url.length <= MAX_DATA_URL_CHARS) break;
      }
      if (!url.startsWith("data:image/")) throw new MediaUploadError("failed");
      if (!fitsInStorage(url)) throw new MediaUploadError("storageFull");
      return { id: newUuid(), url, width, height };
    } catch (e) {
      throw e instanceof MediaUploadError ? e : new MediaUploadError("failed");
    } finally {
      decoded.close();
    }
  },
};

export { r2MediaUploader as mediaUploader } from "./r2-uploader";
