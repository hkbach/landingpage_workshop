import { z } from "zod";
import { BOOKING_STATUSES } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { liveBookings, setBookingStatus } from "@/lib/mock/booking-store";
import { mailBookingCancelledByShop } from "@/lib/mock/booking-mail";

// Status of one booking, as the ops screens change it. MOCK implementation inside Next until apps/api exists.
// TODO(api): the real endpoints are the booking actions (check-in, cancel with a reason, ...), each checked by the state machine.

const bodySchema = z.object({ status: z.enum(BOOKING_STATUSES, { error: "required" }), cancelReason: z.string().trim().max(500).optional(), checkedInAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "dateInvalid").optional(), statusBeforeCheckIn: z.enum(["NOT_CONFIRMED", "CONFIRMED"]).optional() });

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
  if (!setBookingStatus(id, parsed.data.status, parsed.data.cancelReason, parsed.data.checkedInAt, parsed.data.statusBeforeCheckIn, "SHOP")) return apiError(404, "NOT_FOUND", "Booking not found.");
  // The shop cancelled the booking: the guest is told (once: not when it was cancelled already).
  if (parsed.data.status === "CANCELLED" && before && before.status !== "CANCELLED") mailBookingCancelledByShop(id);
  return Response.json({ id, status: parsed.data.status });
}
