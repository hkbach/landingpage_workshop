import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { outboxEmail, resendEmail } from "@/lib/mock/outbox-store";

// An administrator asks the worker to try again an email whose delivery failed. 200 { status, attempts, error? }; 404 for an unknown email; 409 NOT_FAILED when it was delivered. SUPER_ADMIN only.
export async function POST(_request: Request, ctx: RouteContext<"/api/v1/admin/emails/[id]/resend">) {
  const { id } = await ctx.params;
  const email = outboxEmail(id);
  if (!email) return apiError(404, "NOT_FOUND", "Email not found.");
  const d = resendEmail(id);
  if (!d) return apiError(409, "NOT_FAILED", "Only an email whose delivery failed can be sent again.");
  recordAdminAction({ action: "email.resend", entityType: "Email", entityId: id, targetEmail: email.to, details: `${email.type}: ${d.status}` });
  return Response.json({ status: d.status, attempts: d.attempts, ...(d.error ? { error: d.error } : {}) });
}
