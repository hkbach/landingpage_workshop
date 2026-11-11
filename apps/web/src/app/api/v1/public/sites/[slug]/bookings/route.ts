import { z } from "zod";
import { LOCALES } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { siteOrigin } from "@/components/site/site-url";
import { currentShop } from "@/lib/mock/data";
import { createGuestBooking, demoConfirmToken } from "@/lib/mock/booking-store";
import { attributeBooking } from "@/lib/mock/referral-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { guestActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// A guest books on the landing page of the shop (after the OTP). MOCK implementation inside Next until apps/api exists.
// TODO(api): POST /public/sites/{slug}/bookings verifies Turnstile and the OTP, checks the seats in one locked step (SessionCapacityService), computes
// the price and writes the booking and the email to the outbox in ONE transaction. The booking is NOT_CONFIRMED; the email carries the link that confirms it.

const bodySchema = z.object({
  sessionId: z.string().min(1, "required"),
  quantity: z.number({ error: "required" }).int("invalid"),
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  email: z.string().trim().max(254, "tooLong").pipe(z.email("invalid")),
  phone: z.string().trim().max(40, "tooLong").optional(),
  specialRequest: z.string().trim().max(500, "tooLong").optional(),
  promotionIds: z.array(z.string()).max(10).optional(),
  locale: z.enum(LOCALES).optional(),
  /** The code of the affiliate link the guest came through (`?ref=` of the landing page), when there was one. */
  ref: z.string().trim().max(40, "invalid").optional(),
});

/** POST -> 201 { code, status: "NOT_CONFIRMED", demoConfirmUrl? }. A repeated Idempotency-Key gives 200 and the same booking. 409 SESSION_FULL / SESSION_CLOSED. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/public/sites/[slug]/bookings">) {
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
  // The link in the email points at the site of the shop ({slug}.PLATFORM_DOMAIN), with the port of the server in development.
  const raw = (request.headers.get("host") ?? new URL(request.url).host).split(":")[1];
  const port = raw && /^\d{1,5}$/.test(raw) ? raw : undefined; // only a port number goes into the link (the Host header comes from the client)
  const base = siteOrigin(slug);
  const origin = port && base.startsWith("http:") ? `${base}:${port}` : base;
  const res = createGuestBooking(parsed.data, (token) => `${origin}/booking/confirm/${token}`, request.headers.get("idempotency-key") ?? undefined);
  if (!res.ok) {
    if (res.code === "SESSION_FULL" || res.code === "SESSION_CLOSED") return apiError(409, res.code, "This session cannot be booked any more.");
    if (res.code === "UNKNOWN_SESSION") return apiError(404, "NOT_FOUND", "Session not found.");
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { [res.code === "QUANTITY" ? "quantity" : "promotionIds"]: res.code } });
  }
  if (parsed.data.ref && !res.repeated) attributeBooking(res.booking.id, parsed.data.ref, res.booking.workshopId, res.booking.customerId); // an unknown or wrong code is simply ignored
  if (!res.repeated) recordAudit({ ...guestActor(parsed.data.email, parsed.data.fullName), action: "booking.create", entityType: "Booking", entityId: res.booking.id, organizationId: DEMO_ORG, targetEmail: parsed.data.email.toLowerCase(), details: `${res.booking.bookingCode} x${parsed.data.quantity}` });
  const demo = demoConfirmToken(res.booking.id);
  return Response.json(
    { code: res.booking.bookingCode, status: res.booking.status, totalAmount: res.booking.totalAmount, ...(demo ? { demoConfirmUrl: `${origin}/booking/confirm/${demo}` } : {}) },
    { status: res.repeated ? 200 : 201 },
  );
}
