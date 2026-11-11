import { z } from "zod";
import { clientKey } from "@/lib/client-ip";
import { apiError, fieldCodes } from "@/lib/api-error";
import { currentShop } from "@/lib/mock/data";
import { login } from "@/lib/mock/accounts-store";
import { listAccounts } from "@/lib/mock/accounts-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { accountActor, guestActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// Everybody (shop owner, customer) logs in with email + password. MOCK implementation inside Next until apps/api exists.
// TODO(api): POST /auth/login issues the session cookie (httpOnly, SameSite) and rate limits per IP and per email; nothing here is a real session.

const bodySchema = z.object({ email: z.string().trim().min(1, "required").max(254, "tooLong"), password: z.string().min(1, "required").max(200, "tooLong") });

/**
 * POST { email, password } -> 200 { type: "SHOP_OWNER", id, slug } | { type: "CUSTOMER", id }. 401 INVALID_CREDENTIALS (the same for an unknown email and a wrong
 * password), 403 DEACTIVATED (only after the right password), 429 TOO_MANY_ATTEMPTS, 422 with `fields`.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const res = login(parsed.data.email, parsed.data.password, Date.now(), clientKey(request));
  const known = listAccounts().find((x) => x.email.toLowerCase() === parsed.data.email.trim().toLowerCase());
  if (!res.ok) {
    recordAudit({ ...(known ? accountActor(known) : guestActor(parsed.data.email)), action: "auth.login_failed", entityType: "Account", entityId: known?.id ?? "unknown", details: res.code, ...(known?.type === "SHOP_OWNER" && known.shop ? { organizationId: known.shop.id } : {}) });
    if (res.code === "DEACTIVATED") return apiError(403, "DEACTIVATED", "This account is deactivated.");
    if (res.code === "TOO_MANY_ATTEMPTS") return apiError(429, "TOO_MANY_ATTEMPTS", "Too many attempts. Try again later.");
    return apiError(401, "INVALID_CREDENTIALS", "The email or the password is wrong.");
  }
  const a = res.account;
  recordAudit({ ...accountActor(a), action: "auth.login", entityType: "Account", entityId: a.id, organizationId: a.type === "SHOP_OWNER" && a.shop ? a.shop.id : DEMO_ORG });
  // A customer's guest session is kept per shop site (the mock has one): `guestSlug` is the one the customer area looks the email up under. TODO(api): the session cookie.
  return Response.json(a.type === "SHOP_OWNER" ? { type: a.type, id: a.id, slug: a.shop!.slug, email: a.email } : { type: a.type, id: a.id, email: a.email, guestSlug: currentShop.slug }, { headers: { "cache-control": "no-store" } });
}
