import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { setInviteDisabled } from "@/lib/mock/invite-store";

// An administrator switches the invite code (referral link) of a customer off (a reason is needed) or on again. A friend who registers with a code that is off is not counted; the friends
// and the bonuses earned before stay. MOCK implementation inside Next until apps/api exists. TODO(api): SUPER_ADMIN only.
const bodySchema = z.object({ disabled: z.boolean({ error: "required" }), reason: z.string().trim().max(300, "tooLong").optional() }).refine((v) => !v.disabled || (v.reason ?? "") !== "", { path: ["reason"], message: "required" });

/** POST { disabled, reason? } -> 200 { accountId, disabled }. 422 `fields.reason` "required", 404 for a customer that has no account. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/referrals/[accountId]">) {
  const { accountId } = await ctx.params;
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
  if (!setInviteDisabled(accountId, parsed.data.disabled, parsed.data.reason)) return apiError(404, "NOT_FOUND", "Account not found.");
  recordAdminAction({ action: parsed.data.disabled ? "referral.disable" : "referral.enable", entityType: "InviteCode", entityId: accountId, details: parsed.data.disabled ? `reason: ${parsed.data.reason}` : undefined });
  return Response.json({ accountId, disabled: parsed.data.disabled });
}
