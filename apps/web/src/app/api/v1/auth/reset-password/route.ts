import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { completePasswordReset, resetLinkValid } from "@/lib/mock/accounts-store";
import { resetTokenAccount } from "@/lib/mock/accounts-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { accountActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// The page of the link in the reset email: the temporary password of the email plus a new password. MOCK implementation inside Next until apps/api exists.
// TODO(api): rate limit per IP and per token; the token is looked up by its hash.

const bodySchema = z.object({
  token: z.string().min(1, "required").max(200, "invalid"),
  tempPassword: z.string().min(1, "required").max(200, "tooLong").optional(),
  // `password` + `confirmPassword`: what the real API takes (the link alone is the proof). `newPassword` is the older name of the sample data.
  password: z.string().min(1, "required").max(200, "tooLong").optional(),
  confirmPassword: z.string().max(200, "tooLong").optional(),
  newPassword: z.string().min(1, "required").max(200, "tooLong").optional(),
});

/** GET ?token= -> { valid } so the page can say at once that a link is used or expired. */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return Response.json({ valid: token.length > 0 && token.length <= 200 && resetLinkValid(token) }, { headers: { "cache-control": "no-store" } });
}

/** POST { token, tempPassword, newPassword } -> 204. 400 INVALID_LINK (used, expired or unknown), 422 with `fields`: tempPassword wrong, newPassword too short / too long / the same as the temporary one. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  const chosen = parsed.data.password ?? parsed.data.newPassword;
  if (chosen === undefined) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { password: "required" } });
  if (parsed.data.confirmPassword !== undefined && parsed.data.confirmPassword !== chosen) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { confirmPassword: "mismatch" } });
  const owner = resetTokenAccount(parsed.data.token);
  const res = completePasswordReset(parsed.data.token, parsed.data.tempPassword ?? null, chosen);
  if (res.ok && owner) recordAudit({ ...accountActor(owner), action: "auth.password_reset_completed", entityType: "Account", entityId: owner.id, organizationId: owner.type === "SHOP_OWNER" && owner.shop ? owner.shop.id : DEMO_ORG });
  if (res.ok) return new Response(null, { status: 204 });
  if (res.code === "INVALID_LINK") return apiError(400, "INVALID_LINK", "This link has expired or was already used.");
  if (res.code === "WRONG_TEMP_PASSWORD") return apiError(422, "VALIDATION", "The temporary password is wrong.", { fields: { tempPassword: "wrong" } });
  return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: parsed.data.password !== undefined ? { password: "tooShort" } : { newPassword: res.code === "SAME_PASSWORD" ? "samePassword" : "weak" } });
}
