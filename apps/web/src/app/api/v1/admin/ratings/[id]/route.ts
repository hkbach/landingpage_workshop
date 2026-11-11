import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { currentShop } from "@/lib/mock/data";
import { setRatingRemoved } from "@/lib/mock/rating-store";

// An administrator removes the rating (stars and comment) a guest gave when it breaks the rules (a reason is needed), or puts back one they removed. A removed rating no longer counts in the rating of the
// workshop and the shop owner does not see it. SUPER_ADMIN only; MOCK implementation inside Next until apps/api exists. The comment is never written to the audit log.
const bodySchema = z.object({ removed: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() }).refine((v) => !v.removed || (v.reason ?? "") !== "", { path: ["reason"], message: "required" });

/** POST { removed, reason? } -> 200 { id, removed }. 422 `fields.reason` "required", 404, 409 ALREADY_REMOVED / NOT_REMOVED. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/ratings/[id]">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }
  const res = setRatingRemoved(id, parsed.data.removed, parsed.data.reason);
  if (!res.ok) {
    if (res.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Rating not found.");
    return apiError(409, res.code, res.code === "ALREADY_REMOVED" ? "This rating is already removed." : "This rating was not removed.");
  }
  recordAdminAction({ action: parsed.data.removed ? "rating.remove" : "rating.restore", entityType: "Rating", entityId: id, organizationId: currentShop.id, details: parsed.data.removed ? `booking ${res.rating.bookingCode}; reason: ${parsed.data.reason}` : `booking ${res.rating.bookingCode}` });
  return Response.json({ id, removed: parsed.data.removed });
}
