import { MediaUploadError, type MediaUploader, type UploadPurpose } from "./uploader";

export interface UploadManyResult {
  /** URLs of the files that uploaded, in the order the files were selected. */
  urls: string[];
  /** Files that failed, with an i18n error code (builder.image.errors.*). */
  failed: { name: string; code: string }[];
  /** Files not attempted because the slot limit was reached. */
  skipped: string[];
}

/**
 * Upload several files one after another (sequential keeps memory and the mock storage quota under control).
 * At most `remaining` files are attempted; the rest are reported as skipped. One failing file never stops the rest.
 */
export async function uploadMany(
  files: File[],
  uploader: MediaUploader,
  purpose: UploadPurpose,
  remaining: number,
  onProgress?: (done: number, total: number, urlsSoFar: string[]) => void,
): Promise<UploadManyResult> {
  const slots = Math.max(0, remaining);
  const queue = files.slice(0, slots);
  const result: UploadManyResult = { urls: [], failed: [], skipped: files.slice(slots).map((f) => f.name) };

  for (const [i, file] of queue.entries()) {
    try {
      const media = await uploader.upload(file, purpose);
      result.urls.push(media.url);
    } catch (e) {
      result.failed.push({ name: file.name, code: e instanceof MediaUploadError ? e.code : "failed" });
    }
    onProgress?.(i + 1, queue.length, [...result.urls]);
  }
  return result;
}
