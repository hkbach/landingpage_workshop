import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { customerLoginRequired } from "@/lib/customer-access";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { customerActor, DEMO_ORG } from "@/lib/mock/audit-actors";
import { accountOfGuest } from "@/lib/mock/booking-store";
import { MAX_COMMENT, rateBooking } from "@/lib/mock/rating-store";

// A guest rates the workshop of one of their bookings (the Completed button of My Booking): POST { stars: 1..5, comment? } -> 201 { code, stars, comment }. Only a booking the guest CHECKED IN to can be rated
// (409 NOT_CHECKED_IN), once (409 ALREADY_RATED); 404 for an unknown account or booking (the same answer for another customer's booking), 422 with `fields` for wrong stars or a comment over 500 characters.
// MOCK implementation inside Next until apps/api exists. The comment is never written to the audit log.
const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const bodySchema = z.object({ stars: z.number({ error: "invalid" }).int("invalid").min(1, "invalid").max(5, "invalid"), comment: z.string().trim().max(MAX_COMMENT, "tooLong").optional() });

export async function POST(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/bookings/[code]/rating">) {
  const { id, code } = await ctx.params;
  const email = customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null;
  if (!accountOfGuest(id, email)) return apiError(404, "NOT_FOUND", "Account not found.", {}, headers);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.", {}, headers);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields }, headers);
  }
  const res = rateBooking(id, code, parsed.data.stars, parsed.data.comment);
  if (!res.ok) {
    if (res.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", "Booking not found.", {}, headers);
    if (res.code === "NOT_CHECKED_IN") return apiError(409, "NOT_CHECKED_IN", "You can rate a workshop after you check in to the booking.", {}, headers);
    if (res.code === "ALREADY_RATED") return apiError(409, "ALREADY_RATED", "You already rated this booking.", {}, headers);
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { stars: "invalid" } }, headers);
  }
  recordAudit({ ...customerActor(id), action: "booking.rate", entityType: "Booking", entityId: res.rating.bookingId, organizationId: DEMO_ORG, details: `${res.rating.bookingCode}: ${res.rating.stars}/5` });
  return Response.json({ code: res.rating.bookingCode, stars: res.rating.stars, comment: res.rating.comment }, { status: 201, headers });
}
