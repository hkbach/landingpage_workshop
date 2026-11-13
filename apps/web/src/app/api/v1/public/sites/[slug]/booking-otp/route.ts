import { apiError } from "@/lib/api-error";
import { currentShop } from "@/lib/mock/data";
import { liveShop } from "@/lib/mock/shop-admin-store";

// Step 5 of the booking form: the server emails a 6-digit code to the guest. SAMPLE-DATA implementation: nothing is sent, the code is the fixed DEMO_OTP (components/booking/otp.ts).
// With the real API (API_URL set) this route is not reached: /api/v1/* goes to apps/api (POST /public/sites/{slug}/booking-otp).

/** POST { email, locale? } -> 202 { status: "ACCEPTED" } whatever the email is. */
export async function POST(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  if (slug !== currentShop.slug || liveShop(currentShop.id)?.status !== "ACTIVE") return apiError(404, "NOT_FOUND", "Shop not found.");
  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (typeof body?.email !== "string" || !body.email.includes("@")) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { email: "invalid" } });
  return Response.json({ status: "ACCEPTED" }, { status: 202 });
}
