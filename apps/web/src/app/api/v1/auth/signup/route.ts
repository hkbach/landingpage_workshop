import { z } from "zod";
import { checkPassword } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { currentShop } from "@/lib/mock/data";
import { accountActor } from "@/lib/mock/audit-actors";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { signupCustomer, signupShopOwner } from "@/lib/mock/signup-store";

// POST /api/v1/auth/signup: the popup Sign up of the public site, in two kinds. { type: "CUSTOMER", email, password, confirmPassword } or { type: "SHOP_OWNER", email, password, confirmPassword, shopName }.
// 201 with the same body as the login (the person is logged in at once): { type: "SHOP_OWNER", id, email, slug } | { type: "CUSTOMER", id, email, guestSlug }.
// 422 with `fields` ("required" | "invalid" | "tooLong" | "weak" | "mismatch"); 409 EMAIL_TAKEN. The slug of the shop is made from its name and cannot be chosen (FR-ORG-01).
// MOCK implementation inside Next until apps/api exists. TODO(api): the verification of the email, Turnstile, a rate limit.
const email = z.string({ error: "required" }).trim().min(1, "required").max(254, "tooLong").pipe(z.email("invalid"));
const password = z.string({ error: "required" }).min(1, "required").max(200, "tooLong");
const common = { email, password, confirmPassword: password };
const bodySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("CUSTOMER"), ...common }),
  z.object({ type: z.literal("SHOP_OWNER"), ...common, shopName: z.string({ error: "required" }).trim().min(1, "required").max(120, "tooLong") }),
], { error: "invalid" });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "type"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }
  const v = parsed.data;
  const fields: Record<string, string> = {};
  if (checkPassword(v.password) !== "OK") fields.password = "weak";
  if (v.confirmPassword !== v.password) fields.confirmPassword = "mismatch";
  if (Object.keys(fields).length) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });

  const res = v.type === "SHOP_OWNER" ? signupShopOwner({ email: v.email, password: v.password, shopName: v.shopName }) : signupCustomer({ email: v.email, password: v.password });
  if (!res.ok) return res.code === "EMAIL_TAKEN" ? apiError(409, "EMAIL_TAKEN", "This email already has an account.") : apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { password: "weak" } });
  const a = res.account;
  recordAudit({ ...accountActor(a), action: "auth.signup", entityType: "Account", entityId: a.id, organizationId: a.shop?.id ?? currentShop.id, details: a.type === "SHOP_OWNER" ? `shop ${a.shop?.slug}` : undefined });
  const out = a.type === "SHOP_OWNER" ? { type: a.type, id: a.id, email: a.email, slug: a.shop!.slug, setup: true } : { type: a.type, id: a.id, email: a.email, guestSlug: currentShop.slug };
  return Response.json(out, { status: 201, headers: { "cache-control": "no-store" } });
}
