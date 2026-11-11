import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { liveBookings, recordPaid } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The shop set a booking Paid or Unpaid after the session. MOCK implementation inside Next until apps/api exists. The amount is worked out here, from the
// booking (nothing about the amount comes from the browser). The Income page counts only the bookings that are Paid.
// TODO(api): OWNER / MANAGER only, the payment entry and the audit log in ONE transaction.

const bodySchema = z.object({ paid: z.boolean({ error: "required" }) });

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/bookings/[id]/payment">) {
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
  if (!recordPaid(id, parsed.data.paid, currentShop.ownerName)) return apiError(409, "INVALID_STATE", "This booking takes no payment (cancelled, nothing to pay, or its session is completed).");
  // Only a real change is recorded (setting Paid on a paid booking changes nothing).
  if (liveBookings().find((b) => b.id === id)?.paymentStatus !== before.paymentStatus) recordAudit({ ...ownerActor(request), action: parsed.data.paid ? "booking.mark_paid" : "booking.mark_unpaid", entityType: "Booking", entityId: id, organizationId: DEMO_ORG });
  return Response.json({ id, paid: parsed.data.paid });
}
