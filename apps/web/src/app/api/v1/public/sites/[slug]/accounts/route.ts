import { z } from "zod";
import { LOCALES } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { COUNTRY_CODES } from "@/components/booking/countries";
import { currentShop } from "@/lib/mock/data";
import { registerGuestAccount } from "@/lib/mock/booking-store";

// A guest registers an account on the site of the shop. The guest has to have proved the email (the OTP of the login). MOCK implementation inside Next until
// apps/api exists. Every booking made before with the same email (a guest who booked without an account) is merged into the new account.
// TODO(api): POST /public/sites/{slug}/accounts checks the verified email server side, and the account and the merge are ONE transaction (organization_id from the server).

const today = () => new Date().toISOString().slice(0, 10);
const bodySchema = z.object({
  email: z.string().trim().max(254, "tooLong").pipe(z.email("invalid")),
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  country: z.string().refine((c) => COUNTRY_CODES.includes(c), "required"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && d >= "1900-01-01" && d <= today(), "invalid"),
  phone: z.string().trim().max(40, "tooLong").optional(),
  locale: z.enum(LOCALES).optional(),
});

/** POST -> 201 { customerId, created, merged }: `merged` is the number of earlier bookings with this email now in the account. 409 ALREADY_REGISTERED. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/public/sites/[slug]/accounts">) {
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
  const res = registerGuestAccount(parsed.data);
  if (!res.ok) return apiError(409, "ALREADY_REGISTERED", "This email already has an account.");
  return Response.json({ customerId: res.customerId, created: res.created, merged: res.merged }, { status: 201 });
}
