import { apiError } from "@/lib/api-error";
import { mailPaymentReceived } from "@/lib/mock/payment-mail";

// The shop confirmed the payment of a booking: tell the guest. MOCK implementation inside Next until apps/api exists.
// TODO(api): the endpoint that records the payment writes the payment entry and the outbox event in ONE transaction (OWNER / MANAGER only, audited).

export async function POST(_request: Request, ctx: RouteContext<"/api/v1/bookings/[id]/paid">) {
  const { id } = await ctx.params;
  const res = mailPaymentReceived(id);
  if (!res.ok) return apiError(404, "NOT_FOUND", "Booking not found.");
  return Response.json({ notified: res.notified });
}
