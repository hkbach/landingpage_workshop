import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { createManualBooking } from "@/lib/mock/booking-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The shop owner makes a booking for a guest who comes to the studio or calls (walk-in, phone, other). MOCK implementation inside Next until apps/web has the API.
// The booking is CONFIRMED at once (the shop confirmed it with the guest). A guest who gave an email gets an information email (no link to confirm).
// TODO(api): POST /dashboard/bookings checks the seats in one locked step (SessionCapacityService), computes the price and writes the booking and the email to the
// outbox in ONE transaction (OWNER / MANAGER only, audited, organization_id from the server context).

const bodySchema = z.object({
  sessionId: z.string().min(1, "required"),
  quantity: z.number({ error: "required" }).int("invalid"),
  source: z.enum(["WALK_IN", "PHONE", "OTHER"], { error: "invalid" }),
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  email: z.string().trim().max(254, "tooLong").optional().refine((v) => !v || z.email().safeParse(v).success, "invalid"),
  phone: z.string().trim().max(40, "tooLong").optional(),
  specialRequest: z.string().trim().max(500, "tooLong").optional(),
});

/** POST -> 201 { id, code, emailed }. 409 SESSION_FULL / SESSION_CLOSED, 404 for a session that does not exist, 422 for what is wrong with the fields. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const res = createManualBooking(parsed.data);
  if (!res.ok) {
    if (res.code === "SESSION_FULL" || res.code === "SESSION_CLOSED") return apiError(409, res.code, "This session cannot take the booking.");
    if (res.code === "UNKNOWN_SESSION") return apiError(404, "NOT_FOUND", "Session not found.");
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { [res.code === "QUANTITY" ? "quantity" : "email"]: res.code === "QUANTITY" ? "invalid" : "required" } });
  }
  recordAudit({ ...ownerActor(request), action: "booking.manual_create", entityType: "Booking", entityId: res.booking.id, organizationId: DEMO_ORG, ...(parsed.data.email ? { targetEmail: parsed.data.email.toLowerCase() } : {}), details: `${res.booking.bookingCode} ${parsed.data.source}` });
  return Response.json({ id: res.booking.id, code: res.booking.bookingCode, emailed: res.emailed }, { status: 201 });
}
