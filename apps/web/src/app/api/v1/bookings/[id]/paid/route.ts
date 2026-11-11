import { apiError } from "@/lib/api-error";
import { liveBookings, recordPaid } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";
import { mailPaymentReceived } from "@/lib/mock/payment-mail";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The shop confirmed the payment of a booking: tell the guest. MOCK implementation inside Next until apps/api exists.
// TODO(api): the endpoint that records the payment writes the payment entry and the outbox event in ONE transaction (OWNER / MANAGER only, audited).

export async function POST(_request: Request, ctx: RouteContext<"/api/v1/bookings/[id]/paid">) {
  const { id } = await ctx.params;
  if (!liveBookings().some((b) => b.id === id)) return apiError(404, "NOT_FOUND", "Booking not found.");
  // The payment is recorded here too (it changes nothing when the PATCH /payment of the screen came first), so the receipt never goes out for a booking that
  // is not paid: a cancelled one, one with nothing to pay or one of a completed session is refused.
  recordPaid(id, true, currentShop.ownerName);
  if (liveBookings().find((b) => b.id === id)?.paymentStatus !== "PAID") return apiError(409, "NOT_PAID", "This booking is not paid.");
  recordAudit({ ...ownerActor(), action: "booking.mark_paid", entityType: "Booking", entityId: id, organizationId: DEMO_ORG });
  const res = mailPaymentReceived(id);
  if (!res.ok) return apiError(404, "NOT_FOUND", "Booking not found.");
  return Response.json({ notified: res.notified });
}
