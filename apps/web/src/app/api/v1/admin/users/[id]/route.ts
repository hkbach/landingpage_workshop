import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { findAccount, updateAccount } from "@/lib/mock/accounts-store";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";

// A system administrator edits an account: the name and the phone (never the email or the type). MOCK implementation inside Next until apps/api exists.
// TODO(api): SUPER_ADMIN only, audit log with the fields that changed.

const bodySchema = z.object({ fullName: z.string().trim().min(1, "required").max(120, "tooLong"), phone: z.string().trim().max(40, "tooLong").optional() });

export async function GET(_request: Request, ctx: RouteContext<"/api/v1/admin/users/[id]">) {
  const { id } = await ctx.params;
  const a = findAccount(id);
  return a ? Response.json(a, { headers: { "cache-control": "no-store" } }) : apiError(404, "NOT_FOUND", "Account not found.");
}

/** PATCH { fullName, phone? } -> 200 the account. 404 unknown account, 422 with `fields`. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/admin/users/[id]">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  if (!updateAccount(id, { fullName: parsed.data.fullName, ...(parsed.data.phone ? { phone: parsed.data.phone } : {}) })) return apiError(404, "NOT_FOUND", "Account not found.");
  recordAdminAction({ action: "user.update", entityType: "user", entityId: id });
  return Response.json(findAccount(id));
}
