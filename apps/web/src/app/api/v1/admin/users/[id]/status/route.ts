import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { findAccount, setStatusByAdmin } from "@/lib/mock/accounts-store";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";

// A system administrator activates or deactivates an account. MOCK implementation inside Next until apps/api exists. TODO(api): SUPER_ADMIN only, audit log, revoke the sessions.

const bodySchema = z.object({ status: z.enum(["ACTIVE", "DEACTIVATED"], { error: "invalid" }) });

/** POST { status } -> 200 the account. 404 unknown account, 422 with `fields`. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/users/[id]/status">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  if (!setStatusByAdmin(id, parsed.data.status)) return apiError(404, "NOT_FOUND", "Account not found.");
  recordAdminAction({ action: parsed.data.status === "ACTIVE" ? "user.activate" : "user.deactivate", entityType: "user", entityId: id });
  return Response.json(findAccount(id));
}
