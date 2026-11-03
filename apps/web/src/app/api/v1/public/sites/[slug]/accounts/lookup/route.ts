import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { currentShop } from "@/lib/mock/data";
import { guestAccountStatus } from "@/lib/mock/booking-store";

// Does an email have an account on this shop, and how many bookings were made with it? Asked after the guest proved the email (the OTP of the login), so it
// does not tell a stranger anything. MOCK implementation inside Next until apps/api exists. TODO(api): only for a verified email, rate limited.

const bodySchema = z.object({ email: z.string().trim().max(254, "tooLong").pipe(z.email("invalid")) });

/** POST -> 200 { registered, bookings }. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/public/sites/[slug]/accounts/lookup">) {
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
  return Response.json(guestAccountStatus(parsed.data.email));
}
