import { z } from "zod";
import { checkCloseReason } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { liveBookings } from "@/lib/mock/booking-store";
import { customers, sessions } from "@/lib/mock/data";
import { queueSessionRescheduled } from "@/lib/mock/outbox-store";

// A session was re-scheduled: tell the guests who booked it. MOCK implementation inside Next until apps/api exists.
// TODO(api): POST /dashboard/sessions/{id}/reschedule changes the session, moves its bookings and writes the outbox events in ONE transaction
// (OWNER / MANAGER only, organization_id from the session, audited); the worker emails each guest in their language.

const isoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), "dateInvalid");
const bodySchema = z.object({
  oldStartsAt: isoDate,
  newStartsAt: isoDate,
  newEndsAt: isoDate,
  reason: z.object({ code: z.string(), note: z.string().optional() }),
});

export async function POST(request: Request, ctx: RouteContext<"/api/v1/sessions/[id]/reschedule">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  if (Date.parse(parsed.data.newEndsAt) <= Date.parse(parsed.data.newStartsAt)) return apiError(422, "VALIDATION", "The session must end after it starts.", { fields: { newEndsAt: "endBeforeStart" } });
  const reason = checkCloseReason(parsed.data.reason.code, parsed.data.reason.note ?? "");
  if (!reason.ok) return apiError(422, "VALIDATION", "A reason is required.", { fields: { reason: reason.error === "NOTE_REQUIRED" ? "noteRequired" : "required" } });

  // Sessions made in the browser only (not in the mock data) have no bookings here.
  const known = sessions.some((s) => s.id === id);
  const booked = known ? liveBookings().filter((b) => b.sessionId === id && b.status === "CONFIRMED") : [];
  let notified = 0;
  let withoutEmail = 0;
  for (const b of booked) {
    const guest = customers.find((c) => c.id === b.customerId);
    if (!guest?.email) { withoutEmail++; continue; } // walk-in guests have no email
    queueSessionRescheduled({
      to: guest.email, locale: guest.preferredLocale, bookingCode: b.bookingCode, workshopTitle: b.workshopTitle,
      oldStartsAt: parsed.data.oldStartsAt, newStartsAt: parsed.data.newStartsAt, newEndsAt: parsed.data.newEndsAt, timezone: b.timezone, reason: reason.reason,
    });
    notified++;
  }
  return Response.json({ notified, withoutEmail });
}
