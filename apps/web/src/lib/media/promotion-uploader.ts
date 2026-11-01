import { MediaUploadError, mockMediaUploader, type MediaUploader } from "./uploader";

/**
 * Upload of a promotion image: the browser checks and shrinks it (same rules as every other image), then the platform stores it and
 * answers with the path it is served at. M2: replaced by the presigned-URL upload to R2 behind the same interface.
 */
export const promotionImageUploader: MediaUploader = {
  async upload(file, purpose) {
    const local = await mockMediaUploader.upload(file, purpose);
    let res: Response;
    try {
      res = await fetch("/api/v1/media/promotions", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ dataUrl: local.url }),
      });
    } catch {
      throw new MediaUploadError("failed");
    }
    if (res.status === 413) throw new MediaUploadError("tooLarge");
    if (!res.ok) throw new MediaUploadError("failed");
    const body = (await res.json()) as { id: string; url: string };
    return { id: body.id, url: body.url, width: local.width, height: local.height };
  },
};
