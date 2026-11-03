import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { currentShop } from "@/lib/mock/data";
import { cancelBookingByGuest } from "@/lib/mock/booking-store";

// A guest cancels their booking on the page where they look it up (booking code + the email of the booking). MOCK implementation inside Next until apps/api exists.
// TODO(api): POST /public/sites/{slug}/bookings/cancel checks the code and the email, the state machine (until the session starts), frees the seats, writes the audit log and
// the two emails to the outbox in ONE transaction; rate limited.

const bodySchema = z.object({
  code: z.string().trim().min(1, "required").max(40, "tooLong"),
  email: z.string().trim().max(254, "tooLong").pipe(z.email("invalid")),
  reason: z.string().trim().max(300, "tooLong").optional(),
});

/** POST -> 200 { code, status: "CANCELLED" }. 404 NOT_FOUND for a booking that does not exist or whose email does not match (the same answer), 409 NOT_CANCELLABLE. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/public/sites/[slug]/bookings/cancel">) {
  const { slug } = await ctx.params;
  if (slug !== currentShop.slug) return apiError(404, "NOT_FOUND", "Shop not found.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const res = cancelBookingByGuest(parsed.data.code, parsed.data.email, parsed.data.reason);
  if (!res.ok) return res.code === "NOT_FOUND" ? apiError(404, "NOT_FOUND", "Booking not found.") : apiError(409, "NOT_CANCELLABLE", "This booking cannot be cancelled any more.");
  return Response.json({ code: res.booking.bookingCode, status: res.booking.status });
}
