import { z } from "zod";
import { BOOKING_STATUSES, isSessionFinished } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { liveBookings, liveCustomers, liveSession, setBookingStatus } from "@/lib/mock/booking-store";
import { mailBookingCancelledByShop } from "@/lib/mock/booking-mail";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// Status of one booking, as the ops screens change it. MOCK implementation inside Next until apps/api exists.
// TODO(api): the real endpoints are the booking actions (check-in, cancel with a reason, ...), each checked by the state machine.

const bodySchema = z.object({ status: z.enum(BOOKING_STATUSES, { error: "required" }), cancelReason: z.string().trim().max(500).optional(), checkedInAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "dateInvalid").optional(), statusBeforeCheckIn: z.enum(["NOT_CONFIRMED", "CONFIRMED"]).optional() });

const isOpen = (s: string) => s === "NOT_CONFIRMED" || s === "CONFIRMED";

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/bookings/[id]/status">) {
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const before = liveBookings().find((b) => b.id === id);
  if (!before) return apiError(404, "NOT_FOUND", "Booking not found.");
  const to = parsed.data.status;
  if (to === before.status) return Response.json({ id, status: to }); // nothing changes (a second cancel does not email again)
  // The state machine, checked here (the browser is not trusted): check-in and uncheck-in while the session is not closed, cancel from Not confirmed or
  // Confirmed. A cancelled booking never comes back (its seats may be taken), and nobody becomes Not confirmed or Confirmed except by an uncheck-in.
  const now = new Date();
  const closed = isSessionFinished(liveSession(before.sessionId, now)?.status ?? "CLOSED");
  const allowed = to === "CHECKED_IN" ? isOpen(before.status) && !closed
    : to === "CANCELLED" ? isOpen(before.status)
    : before.status === "CHECKED_IN" && !closed;
  if (!allowed) return apiError(409, "INVALID_STATE", "This change is not allowed for this booking.");
  // The time of the check-in: the one the screen sent, never later than now.
  const sent = parsed.data.checkedInAt;
  const at = to === "CHECKED_IN" ? (sent && Date.parse(sent) <= now.getTime() ? new Date(sent).toISOString() : now.toISOString()) : undefined;
  setBookingStatus(id, to, to === "CANCELLED" ? parsed.data.cancelReason : undefined, at, parsed.data.statusBeforeCheckIn, "SHOP");
  // The shop cancelled the booking: the guest is told.
  const guestEmail = liveCustomers().find((c) => c.id === before.customerId)?.email?.toLowerCase();
  recordAudit({ ...ownerActor(), action: `booking.${to === "CHECKED_IN" ? "check_in" : to === "CANCELLED" ? "cancel_by_shop" : "undo_check_in"}`, entityType: "Booking", entityId: id, organizationId: DEMO_ORG, ...(guestEmail ? { targetEmail: guestEmail } : {}), details: before.bookingCode });
  if (to === "CANCELLED") mailBookingCancelledByShop(id);
  return Response.json({ id, status: to });
}
