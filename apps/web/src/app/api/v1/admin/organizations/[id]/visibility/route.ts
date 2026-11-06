import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { setShowOnCustomerPage } from "@/lib/mock/shop-admin-store";

// Whether the workshops of a shop are listed on the Workshops page of the guests. MOCK implementation inside Next until apps/api exists. TODO(api): SUPER_ADMIN only, audit log.

const bodySchema = z.object({ show: z.boolean({ error: "required" }) });

/** POST { show } -> 200 { show }. 404 unknown shop. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/organizations/[id]/visibility">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  if (!setShowOnCustomerPage(id, parsed.data.show)) return apiError(404, "NOT_FOUND", "Organization not found.");
  recordAdminAction({ action: parsed.data.show ? "organization.show_to_guests" : "organization.hide_from_guests", entityType: "organization", entityId: id, organizationId: id });
  return Response.json({ show: parsed.data.show });
}
