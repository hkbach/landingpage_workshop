import { apiError } from "@/lib/api-error";
import { deliveryOf, outboxEmail } from "@/lib/mock/outbox-store";

// One email of the outbox as an administrator sees it. The body is shown only for the emails an administrator wrote: the emails of the system (booking confirmations with the link that confirms a
// booking, password resets with a temporary password) carry secrets, so the administrator sees who they went to, when and what happened, never what they say. SUPER_ADMIN only.
/** GET -> { id, type, to, subject, createdAt, status, attempts, error?, body? and sentBy? (administrator emails only) }. 404. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/admin/emails/[id]">) {
  const { id } = await ctx.params;
  const e = outboxEmail(id);
  if (!e) return apiError(404, "NOT_FOUND", "Email not found.");
  const d = deliveryOf(id);
  return Response.json({ id, type: e.type, to: e.to, subject: e.subject, createdAt: e.createdAt, status: d.status, attempts: d.attempts, ...(d.error ? { error: d.error } : {}), ...(e.type === "ADMIN_MESSAGE" ? { body: e.body, sentBy: e.sentBy } : {}) }, { headers: { "cache-control": "no-store" } });
}
