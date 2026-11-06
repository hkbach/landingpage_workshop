import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { setShopActive } from "@/lib/mock/shop-admin-store";

// A system administrator deactivates (SUSPENDED) or activates a shop. MOCK implementation inside Next until apps/api exists. TODO(api): SUPER_ADMIN only, audit log.

const bodySchema = z.object({ active: z.boolean({ error: "required" }), reason: z.string().max(500).optional() });

/** POST { active, reason? } -> 200 { status, statusReason? }. 404 unknown shop, 409 NOT_ALLOWED (only ACTIVE <-> SUSPENDED), 422 a reason is needed to deactivate. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/organizations/[id]/status">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const res = setShopActive(id, parsed.data.active, parsed.data.reason ?? "");
  if (res.ok) recordAdminAction({ action: parsed.data.active ? "organization.reactivate" : "organization.suspend", entityType: "organization", entityId: id, organizationId: id });
  if (res.ok) return Response.json({ status: res.shop.status, ...(res.shop.statusReason ? { statusReason: res.shop.statusReason } : {}) });
  if (res.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Organization not found.");
  if (res.code === "REASON_REQUIRED") return apiError(422, "VALIDATION", "A reason is required to deactivate a shop.", { fields: { reason: "required" } });
  return apiError(409, "NOT_ALLOWED", "Only an active shop can be deactivated and a deactivated shop activated.");
}
