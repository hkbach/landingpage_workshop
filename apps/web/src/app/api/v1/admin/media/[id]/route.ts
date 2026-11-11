import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { deleteImage, hasImage, listMedia } from "@/lib/mock/media-store";
import { clearPromotionImage } from "@/lib/mock/promotion-store";

// An administrator removes an image a shop uploaded (a reason is needed): the file is deleted and the records that showed it (the vouchers) have no image any more. An image shown from a link is not a
// file of the platform and is not removed here. SUPER_ADMIN only; MOCK implementation inside Next until apps/api exists. TODO(api): the object in R2 and its cache at the CDN, the shop is told by email.
const bodySchema = z.object({ reason: z.string({ error: "required" }).trim().min(1, "required").max(300, "tooLong") });

/** POST { reason } -> 200 { id, cleared }: `cleared` is how many records stopped showing it. 422 `fields.reason`, 404 for an image that is not a file of the platform. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/media/[id]">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "A reason is required.", { fields: { reason: parsed.error.issues[0]?.message ?? "required" } });
  if (!hasImage(id)) return apiError(404, "NOT_FOUND", "Image not found.");
  const info = listMedia().find((m) => m.id === id)!;
  deleteImage(id);
  const cleared = clearPromotionImage(id);
  recordAdminAction({ action: "media.remove", entityType: "Media", entityId: id, organizationId: info.shopId, details: `${info.kind}; reason: ${parsed.data.reason}` });
  return Response.json({ id, cleared });
}
