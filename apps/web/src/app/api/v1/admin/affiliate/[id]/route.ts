import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { setReferralDisabled } from "@/lib/mock/referral-store";

// An administrator switches an affiliate link off (a reason is needed) or on again. A link that is off no longer leads to a booking (the landing page says it is deactivated), nothing new is
// attributed to it, and the customer sees it as Deactive; what it earned before stays. MOCK implementation inside Next until apps/api exists. TODO(api): SUPER_ADMIN only, one transaction.
const bodySchema = z.object({ disabled: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() }).refine((v) => !v.disabled || (v.reason ?? "") !== "", { path: ["reason"], message: "required" });

/** POST { disabled, reason? } -> 200 { id, disabled }. 422 `fields.reason` "required" when switching off without a reason, 404 for an unknown link. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/affiliate/[id]">) {
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
  const link = setReferralDisabled(id, parsed.data.disabled, parsed.data.reason);
  if (!link) return apiError(404, "NOT_FOUND", "Link not found.");
  recordAdminAction({ action: parsed.data.disabled ? "affiliate.disable" : "affiliate.enable", entityType: "AffiliateLink", entityId: id, organizationId: link.shopId, details: parsed.data.disabled ? `reason: ${parsed.data.reason}` : undefined });
  return Response.json({ id, disabled: Boolean(link.disabled) });
}
