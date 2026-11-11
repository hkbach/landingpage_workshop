import { apiError } from "@/lib/api-error";
import { MAX_IMAGE_BYTES, saveImage } from "@/lib/mock/media-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// Upload of a promotion image. MOCK of POST /media/presign-upload + complete (FR-MEDIA-01): the browser sends the resized image as a
// data URL, the server checks it and answers with the path the image is served at. TODO(api): OWNER / MANAGER session, per organization.

/** POST { dataUrl } -> 201 { id, url }. 413 when too large, 422 when it is not a jpeg, png or webp image. */
export async function POST(request: Request) {
  // A body far larger than an image can be (base64 makes it about 4/3 bigger) is refused before it is read.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES * 1.5 + 1024) return apiError(413, "IMAGE_TOO_LARGE", `The image can be at most ${MAX_IMAGE_BYTES / 1_000_000} MB.`);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const res = saveImage((body as { dataUrl?: unknown } | null)?.dataUrl);
  if (!res.ok) {
    return res.code === "TOO_LARGE"
      ? apiError(413, "IMAGE_TOO_LARGE", `The image can be at most ${MAX_IMAGE_BYTES / 1_000_000} MB.`)
      : apiError(422, "VALIDATION", "The file must be a JPEG, PNG or WebP image.", { fields: { dataUrl: "imageInvalid" } });
  }
  recordAudit({ ...ownerActor(), action: "media.upload", entityType: "Media", entityId: res.id, organizationId: DEMO_ORG, details: "promotion image" });
  return Response.json({ id: res.id, url: `/api/v1/media/promotions/${res.id}` }, { status: 201 });
}
