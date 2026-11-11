import { z } from "zod";
import { GENDERS, isFavoriteCategories, LOCALES, SOCIAL_PLATFORMS, WORKSHOP_CATEGORIES } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { COUNTRY_CODES } from "@/components/booking/countries";
import { isHttpsUrl } from "@/components/sections/safe-url";
import { customerLoginRequired } from "@/lib/customer-access";
import { accountOfGuest, updateGuestAccount } from "@/lib/mock/booking-store";
import type { CustomerProfile } from "@/lib/customer-api";
import type { Customer } from "@/lib/types";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { customerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The account of a guest, seen by the guest themselves (/customer/{id}). MOCK implementation inside Next until apps/api exists.
// The guest is identified by the email of the account in the `x-guest-email` header (what the browser keeps after the OTP login); any other email, an unknown id
// and a customer without an account all get the same 404, so the ids cannot be probed. While the login of the guest area is switched off (testing only, never in
// production: see customerLoginRequired) the id alone is enough.
// TODO(api): the account of the guest session (cookie), never an email sent by the browser; organization_id from the server.

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };
const notFound = () => apiError(404, "NOT_FOUND", "Account not found.", {}, headers);

/** What the guest sees of their own account. */
function profileOf(c: Customer): CustomerProfile {
  const a = c.account!;
  return {
    id: c.id, fullName: c.fullName, email: c.email!, ...(c.phone ? { phone: c.phone } : {}), preferredLocale: c.preferredLocale,
    account: { country: a.country, birthDate: a.birthDate, favoriteCategories: a.favoriteCategories ?? [], ...(a.gender ? { gender: a.gender } : {}), ...(a.socials ? { socials: a.socials } : {}), ...(a.avatarUrl ? { avatarUrl: a.avatarUrl } : {}) },
  };
}

const today = () => new Date().toISOString().slice(0, 10);
const bodySchema = z.object({
  fullName: z.string().trim().min(1, "required").max(120, "tooLong"),
  phone: z.string().trim().max(40, "tooLong").optional(),
  preferredLocale: z.enum(LOCALES, { error: "required" }),
  country: z.string().refine((c) => COUNTRY_CODES.includes(c), "required"),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "invalid").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && d >= "1900-01-01" && d <= today(), "invalid"),
  /** The three fields of workshops the guest likes (exactly three different ones). */
  favoriteCategories: z.array(z.enum(WORKSHOP_CATEGORIES, "categories"), "categories").refine((c) => isFavoriteCategories(c), "categories"),
  gender: z.enum(GENDERS).optional(),
  socials: z.partialRecord(z.enum(SOCIAL_PLATFORMS), z.string().trim().max(100, "tooLong")).optional(),
  avatarUrl: z.string().trim().max(500, "tooLong").refine((v) => v === "" || isHttpsUrl(v), "urlInvalid").optional(),
});

/** The email to check the account against; null when the login is switched off (the id alone is enough). */
const emailOf = (request: Request): string | null => (customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null);

/** GET -> 200 the profile; 404 NOT_FOUND. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/customer/[id]">) {
  const { id } = await ctx.params;
  const customer = accountOfGuest(id, emailOf(request));
  if (!customer) return notFound();
  return Response.json(profileOf(customer), { headers });
}

/** PATCH the whole profile (name, phone, language, country, date of birth, gender, socials, picture) -> 200 the profile; 422 with the fields; 404 NOT_FOUND. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/customer/[id]">) {
  const { id } = await ctx.params;
  if (!accountOfGuest(id, emailOf(request))) return notFound(); // checked first: nobody learns what is valid from a wrong email
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.", {}, headers);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) }, headers);
  const { preferredLocale, ...rest } = parsed.data;
  const res = updateGuestAccount(id, emailOf(request), { ...rest, locale: preferredLocale });
  if (!res.ok) return notFound();
  recordAudit({ ...customerActor(id), action: "customer.profile_update", entityType: "Customer", entityId: id, organizationId: DEMO_ORG });
  return Response.json(profileOf(res.customer), { headers });
}
