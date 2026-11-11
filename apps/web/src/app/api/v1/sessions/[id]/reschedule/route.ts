import { z } from "zod";
import { checkRescheduleReason } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { mailSessionRescheduled } from "@/lib/mock/session-mail";
import { adminEditGate, noteAdminEdit } from "@/lib/mock/admin-edit";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// A session was re-scheduled: tell the guests who booked it. MOCK implementation inside Next until apps/api exists.
// TODO(api): POST /dashboard/sessions/{id}/reschedule changes the session, moves its bookings and writes the outbox events in ONE transaction
// (OWNER / MANAGER only, organization_id from the session, audited); the worker emails each guest in their language.

// An instant with its offset (Z or +07:00), stored and mailed as UTC ISO.
const isoDate = z.string().refine((v) => /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)), "dateInvalid").transform((v) => new Date(v).toISOString());
const bodySchema = z.object({
  oldStartsAt: isoDate,
  newStartsAt: isoDate,
  newEndsAt: isoDate,
  reason: z.object({ code: z.string(), note: z.string().optional() }),
});

export async function POST(request: Request, ctx: RouteContext<"/api/v1/sessions/[id]/reschedule">) {
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
  if (Date.parse(parsed.data.newStartsAt) <= Date.now()) return apiError(422, "VALIDATION", "The new time must be in the future.", { fields: { newStartsAt: "past" } });
  if (parsed.data.newStartsAt === parsed.data.oldStartsAt) return apiError(422, "VALIDATION", "The new time is the same as the old one.", { fields: { newStartsAt: "same" } });
  if (Date.parse(parsed.data.newEndsAt) <= Date.parse(parsed.data.newStartsAt)) return apiError(422, "VALIDATION", "The session must end after it starts.", { fields: { newEndsAt: "endBeforeStart" } });
  const reason = checkRescheduleReason(parsed.data.reason.code, parsed.data.reason.note ?? "");
  if (!reason.ok) return apiError(422, "VALIDATION", "A reason is required.", { fields: { reason: reason.error === "NOTE_REQUIRED" ? "noteRequired" : "required" } });

  // Every guest who booked the session is told, except the ones who cancelled their booking (sessions made in the browser only have no bookings here).
  recordAudit({ ...ownerActor(request), action: "session.reschedule", entityType: "Session", entityId: id, organizationId: DEMO_ORG, details: reason.reason.code });
  noteAdminEdit(request, { action: "session.reschedule", entityType: "Session", entityId: id, summary: "a session was moved to another time" });
  return Response.json(mailSessionRescheduled(id, {
    oldStartsAt: parsed.data.oldStartsAt, newStartsAt: parsed.data.newStartsAt, newEndsAt: parsed.data.newEndsAt, reason: reason.reason,
  }));
}
