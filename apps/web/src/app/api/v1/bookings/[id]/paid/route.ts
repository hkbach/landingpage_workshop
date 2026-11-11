import { apiError } from "@/lib/api-error";
import { liveBookings, recordPaid } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { mailPaymentReceived } from "@/lib/mock/payment-mail";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The shop confirmed the payment of a booking: tell the guest. MOCK implementation inside Next until apps/api exists.
// TODO(api): the endpoint that records the payment writes the payment entry and the outbox event in ONE transaction (OWNER / MANAGER only, audited).

export async function POST(request: Request, ctx: RouteContext<"/api/v1/bookings/[id]/paid">) {
  const { id } = await ctx.params;
  const before = liveBookings().find((b) => b.id === id);
  if (!before) return apiError(404, "NOT_FOUND", "Booking not found.");
  // The payment is recorded here too (it changes nothing when the PATCH /payment of the screen came first), so the receipt never goes out for a booking that
  // is not paid: a cancelled one, one with nothing to pay or one of a completed session is refused.
  recordPaid(id, true, currentShop.ownerName);
  if (liveBookings().find((b) => b.id === id)?.paymentStatus !== "PAID") return apiError(409, "NOT_PAID", "This booking is not paid.");
  // The screen usually records the payment with PATCH /payment first (which writes the audit line); only a change made here is recorded again.
  if (before.paymentStatus !== "PAID") recordAudit({ ...ownerActor(request), action: "booking.mark_paid", entityType: "Booking", entityId: id, organizationId: DEMO_ORG });
  const res = mailPaymentReceived(id);
  if (!res.ok) return apiError(404, "NOT_FOUND", "Booking not found.");
  return Response.json({ notified: res.notified });
}
