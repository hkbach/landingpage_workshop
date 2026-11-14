import { decode, MAX_EDGE, MediaUploadError, type MediaUploader, type UploadedMedia, type UploadPurpose } from "./uploader";
import { ALLOWED_IMAGE_TYPES, validateImageFile } from "./validate";

// Upload of an image to Cloudflare R2: the browser checks the file (size, real type from the first bytes) and shrinks it, the API gives a URL that lets it PUT that one file for five minutes
// (POST /api/v1/media/presign), and the answer is the public https address the image is read at. No key ever reaches the browser.

export interface Prepared { blob: Blob; width: number; height: number }
type Fetch = typeof fetch;

/** Shrinks the image to MAX_EDGE on its longest side and writes it as WebP (JPEG where the browser cannot). */
export async function prepareImage(file: File): Promise<Prepared> {
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
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
    const webp = await toBlob("image/webp");
    const blob = webp && webp.type === "image/webp" ? webp : await toBlob("image/jpeg");
    if (!blob || !(ALLOWED_IMAGE_TYPES as readonly string[]).includes(blob.type)) throw new MediaUploadError("failed");
    return { blob, width, height };
  } catch (e) {
    throw e instanceof MediaUploadError ? e : new MediaUploadError("failed");
  } finally {
    decoded.close();
  }
}

/** `prepare` and `fetchImpl` are given by the tests. */
export function createR2Uploader(deps: { prepare?: (file: File) => Promise<Prepared>; fetchImpl?: Fetch } = {}): MediaUploader {
  const prepare = deps.prepare ?? prepareImage;
  const send: Fetch = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  return {
    async upload(file: File, purpose: UploadPurpose): Promise<UploadedMedia> {
      const check = await validateImageFile(file);
      if (!check.ok) throw new MediaUploadError(check.error);
      const { blob, width, height } = await prepare(file);

      let signed: Response;
      try {
        // the photo of a customer has an address of its own (it belongs to an account, not to a shop)
        signed = purpose === "avatar"
          ? await send("/api/v1/media/avatar/presign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ contentType: blob.type, size: blob.size }) })
          : await send("/api/v1/media/presign", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ purpose, contentType: blob.type, size: blob.size }) });
      } catch {
        throw new MediaUploadError("failed");
      }
      if (signed.status === 503) throw new MediaUploadError("notConfigured");
      if (signed.status === 422) throw new MediaUploadError("tooLarge");
      if (!signed.ok) throw new MediaUploadError("failed");
      const target = (await signed.json()) as { key: string; uploadUrl: string; headers: Record<string, string>; publicUrl: string };

      try {
        const put = await send(target.uploadUrl, { method: "PUT", headers: target.headers, body: blob });
        if (!put.ok) throw new MediaUploadError("failed");
      } catch (e) {
        throw e instanceof MediaUploadError ? e : new MediaUploadError("failed");
      }
      return { id: target.key, url: target.publicUrl, width, height };
    },
  };
}

export const r2MediaUploader: MediaUploader = createR2Uploader();
