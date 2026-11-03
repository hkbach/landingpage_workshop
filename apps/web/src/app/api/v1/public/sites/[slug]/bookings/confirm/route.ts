import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { currentShop } from "@/lib/mock/data";
import { confirmBookingByToken } from "@/lib/mock/booking-store";

// The guest opens the link of the confirmation email: the booking becomes CONFIRMED. MOCK implementation inside Next until apps/api exists.
// TODO(api): the token is stored hashed with an expiry, and a link opened by a mail scanner must not confirm by itself (confirm on a click).

const bodySchema = z.object({ token: z.string().min(8).max(100) });

/** POST { token } -> 200 { code, status: "CONFIRMED", already }. 404 unknown link, 409 CANCELLED (the booking was cancelled). Opening the link again is harmless. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/public/sites/[slug]/bookings/confirm">) {
  const { slug } = await ctx.params;
  if (slug !== currentShop.slug) return apiError(404, "NOT_FOUND", "Shop not found.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(404, "NOT_FOUND", "This link is not valid.");
  const res = confirmBookingByToken(parsed.data.token);
  if (!res.ok) return res.code === "CANCELLED" ? apiError(409, "CANCELLED", "This booking was cancelled.") : apiError(404, "NOT_FOUND", "This link is not valid.");
  return Response.json({ code: res.booking.bookingCode, status: res.booking.status, already: res.already });
}
