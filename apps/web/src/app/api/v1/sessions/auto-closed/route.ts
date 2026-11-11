import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { mailAutoClosed } from "@/lib/mock/session-mail";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { SYSTEM_ACTOR, DEMO_ORG } from "@/lib/mock/audit-actors";

// The system closed sessions because their time ended: tell the guests who booked them, once for each session. MOCK implementation inside Next
// until apps/api exists. TODO(api): the worker that closes the sessions writes the outbox events itself, so there is no endpoint.

// An instant with its offset (Z or +07:00), stored and mailed as UTC ISO.
const isoDate = z.string().refine((v) => /(?:Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)), "dateInvalid").transform((v) => new Date(v).toISOString());
const bodySchema = z.object({ sessions: z.array(z.object({ id: z.string().min(1), startsAt: isoDate, endsAt: isoDate })).max(500) });

/** POST { sessions: [{ id, startsAt, endsAt }] } -> { mailed: [{ id, notified }] } (only the sessions not handled before). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const mailed = mailAutoClosed(parsed.data.sessions);
  // Only the sessions handled now (the page sends every closed session each time it loads; a session not over yet is skipped).
  for (const m of mailed) recordAudit({ ...SYSTEM_ACTOR, action: "session.auto_close", entityType: "Session", entityId: m.id, organizationId: DEMO_ORG });
  return Response.json({ mailed });
}
