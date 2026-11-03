import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { adminChangeSession } from "@/lib/mock/session-admin-store";

// A system administrator closes or opens a session, without the limits of the shop owner (SUPER_ADMIN only; TODO(api): check the role, audit log).

const bodySchema = z.object({ action: z.enum(["close", "reopen"], { error: "required" }), reason: z.string().max(500).optional() });

/** POST { action: "close" | "reopen", reason? } -> 200 { session }. 404 unknown session, 409 NOT_ALLOWED, 422 a reason is needed to close. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/admin/sessions/[id]">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const res = adminChangeSession(id, parsed.data.action, parsed.data.reason ?? "");
  if (res.ok) return Response.json({ session: res.session });
  if (res.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Session not found.");
  if (res.code === "REASON_REQUIRED") return apiError(422, "VALIDATION", "A reason is required to close a session.", { fields: { reason: "required" } });
  return apiError(409, "NOT_ALLOWED", "This session cannot be changed now: a session that has ended stays closed, and an open session is closed first.");
}
