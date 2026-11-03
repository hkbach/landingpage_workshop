import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { switchWorkshop } from "@/lib/mock/workshop-status-store";

// Activate / deactivate a workshop of the shop. MOCK implementation inside Next until apps/api exists.
// TODO(api): POST /dashboard/workshops/{id}/status (OWNER / MANAGER only, organization_id from the session, audited).

const bodySchema = z.object({ status: z.enum(["ACTIVE", "DRAFT"], { error: "invalid" }) });

/** POST { status: "ACTIVE" | "DRAFT" } -> 200 { workshop }. 404 unknown workshop; 409 STATUS (already in that status) or SESSIONS_OPEN (a workshop is
 * only deactivated when all its sessions are Closed; `details.open` says how many are not). */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/workshops/[id]/status">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "The status must be ACTIVE or DRAFT.", { fields: { status: "invalid" } });
  const res = switchWorkshop(id, parsed.data.status);
  if (res.ok) return Response.json({ workshop: res.workshop });
  if (res.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Workshop not found.");
  if (res.code === "SESSIONS_OPEN") return apiError(409, "SESSIONS_OPEN", "A workshop can only be deactivated when all its sessions are closed.", { open: res.open });
  return apiError(409, "STATUS", "This workshop cannot be switched to that status now.");
}
