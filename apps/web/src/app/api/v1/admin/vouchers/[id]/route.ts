import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { currentShop } from "@/lib/mock/data";
import { holdPromotion } from "@/lib/mock/promotion-store";

// An administrator pauses a voucher (promotion) of a shop that breaks the rules (a reason is needed), or resumes one they paused. A voucher paused by an administrator cannot be resumed by the shop
// owner; bookings that already used it keep their discount. SUPER_ADMIN only; MOCK implementation inside Next until apps/api exists.
const bodySchema = z.object({ hold: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() }).refine((v) => !v.hold || (v.reason ?? "") !== "", { path: ["reason"], message: "required" });

/** POST { hold, reason? } -> 200 { id, hold }. 422 `fields.reason` "required", 404, 409 ALREADY_HELD / NOT_HELD. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/vouchers/[id]">) {
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
  const res = holdPromotion(id, parsed.data.hold, parsed.data.reason);
  if (!res.ok) {
    if (res.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Voucher not found.");
    if (res.code === "REASON_REQUIRED") return apiError(422, "VALIDATION", "A reason is required.", { fields: { reason: "required" } });
    return apiError(409, res.code, res.code === "ALREADY_HELD" ? "This voucher is already paused by an administrator." : "This voucher was not paused by an administrator.");
  }
  recordAdminAction({ action: parsed.data.hold ? "voucher.pause" : "voucher.resume", entityType: "Promotion", entityId: id, organizationId: currentShop.id, details: parsed.data.hold ? `code ${res.promotion.code}; reason: ${parsed.data.reason}` : `code ${res.promotion.code}` });
  return Response.json({ id, hold: parsed.data.hold });
}
