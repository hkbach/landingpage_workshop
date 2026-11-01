import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { bookingCutoffMinutes, MAX_BOOKING_CUTOFF_MINUTES, setBookingCutoffMinutes } from "@/lib/mock/shop-settings-store";

// Booking settings of the shop (Settings page). MOCK implementation inside Next until apps/api exists.
// TODO(api): OWNER / MANAGER only, filtered by organization_id from the session, audited.

const bodySchema = z.object({
  bookingCutoffMinutes: z
    .number({ error: "cutoffInvalid" })
    .int("cutoffInvalid")
    .min(0, "cutoffInvalid")
    .max(MAX_BOOKING_CUTOFF_MINUTES, "cutoffInvalid"),
});

export async function GET() {
  return Response.json({ bookingCutoffMinutes: bookingCutoffMinutes() }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  setBookingCutoffMinutes(parsed.data.bookingCutoffMinutes);
  return Response.json({ bookingCutoffMinutes: parsed.data.bookingCutoffMinutes });
}
