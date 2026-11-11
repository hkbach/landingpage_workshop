import { z } from "zod";
import { checkCloseReasonFor } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { mailSessionClosed } from "@/lib/mock/session-mail";
import { adminEditGate, noteAdminEdit } from "@/lib/mock/admin-edit";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The owner closed a session: tell the guests who booked it. MOCK implementation inside Next until apps/api exists.
// TODO(api): POST /dashboard/sessions/{id}/close changes the status and writes the outbox events in ONE transaction (OWNER / MANAGER only, audited).

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "dateInvalid");
const bodySchema = z.object({
  startsAt: isoDate,
  endsAt: isoDate,
  reason: z.object({ code: z.string(), note: z.string().optional() }),
});

export async function POST(request: Request, ctx: RouteContext<"/api/v1/sessions/[id]/closed">) {
  const { id } = await ctx.params;
  const refused = adminEditGate(request);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const reason = checkCloseReasonFor(parsed.data, new Date(), parsed.data.reason.code, parsed.data.reason.note ?? "");
  if (!reason.ok) return apiError(422, "VALIDATION", "A reason is required.", { fields: { reason: reason.error === "NOTE_REQUIRED" ? "noteRequired" : "required" } });
  recordAudit({ ...ownerActor(request), action: "session.close", entityType: "Session", entityId: id, organizationId: DEMO_ORG, details: reason.reason.code });
  noteAdminEdit(request, { action: "session.close", entityType: "Session", entityId: id, summary: "a session was closed" });
  return Response.json(mailSessionClosed(id, { startsAt: parsed.data.startsAt, endsAt: parsed.data.endsAt, reason: reason.reason }));
}
