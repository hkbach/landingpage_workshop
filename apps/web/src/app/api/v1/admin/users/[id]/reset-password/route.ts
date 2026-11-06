import { apiError } from "@/lib/api-error";
import { startPasswordReset } from "@/lib/mock/accounts-store";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { appOrigin } from "@/lib/mock/app-origin";

// A system administrator resets the password of an account: the account is deactivated and the person is emailed a temporary password and the link of the page
// where a new password is chosen. MOCK implementation inside Next until apps/api exists. TODO(api): SUPER_ADMIN only, audit log, the email through the outbox.

/** POST -> 200 { expiresAt }. The temporary password and the link are never in the response, only in the email. 404 unknown account. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/users/[id]/reset-password">) {
  const { id } = await ctx.params;
  const origin = appOrigin(request);
  const res = startPasswordReset(id, (token) => `${origin}/reset-password?token=${token}`);
  if (!res.ok) return apiError(404, "NOT_FOUND", "Account not found.");
  recordAdminAction({ action: "user.reset_password", entityType: "user", entityId: id });
  return Response.json({ expiresAt: res.expiresAt }, { headers: { "cache-control": "no-store" } });
}
