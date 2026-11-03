import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { recordPaid } from "@/lib/mock/booking-store";
import { currentShop } from "@/lib/mock/data";

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
  if (!recordPaid(id, parsed.data.paid, currentShop.ownerName)) return apiError(404, "NOT_FOUND", "Booking not found, or it has nothing to pay.");
  return Response.json({ id, paid: parsed.data.paid });
}
