import { z } from "zod";
import { LOCALES } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { ADMIN_EMAIL, recordAdminAction } from "@/lib/mock/admin-audit-store";
import { getLegal, isLegalKind, LEGAL_MAX_CHARS, setLegalContent } from "@/lib/mock/legal-store";

// The text of the Terms of Service (kind "terms") and of the Privacy Policy ("privacy") in each language. SUPER_ADMIN only; MOCK implementation inside Next until apps/api exists.
// The text itself is never written to the audit log (only the kind, the language and the new version).
const headers = { "cache-control": "no-store" };
const bodySchema = z.object({ locale: z.enum(LOCALES, { error: "invalid" }), content: z.string({ error: "required" }).max(LEGAL_MAX_CHARS, "tooLong") });

/** GET -> { kind, content: { [locale]: text }, version, updatedAt, updatedBy }. 404 for another kind. */
export async function GET(_request: Request, ctx: RouteContext<"/api/v1/admin/legal/[kind]">) {
  const { kind } = await ctx.params;
  if (!isLegalKind(kind)) return apiError(404, "NOT_FOUND", "Unknown document.", {}, headers);
  return Response.json(getLegal(kind), { headers });
}

/** PUT { locale, content } -> 200 the document. An empty content removes the language. 422 `fields` ("invalid" | "tooLong"), 404. */
export async function PUT(request: Request, ctx: RouteContext<"/api/v1/admin/legal/[kind]">) {
  const { kind } = await ctx.params;
  if (!isLegalKind(kind)) return apiError(404, "NOT_FOUND", "Unknown document.", {}, headers);
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.", {}, headers);
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields }, headers);
  }
  const res = setLegalContent(kind, parsed.data.locale, parsed.data.content, ADMIN_EMAIL);
  if (!res.ok) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { [res.code === "TOO_LONG" ? "content" : "locale"]: res.code === "TOO_LONG" ? "tooLong" : "invalid" } }, headers);
  if (res.changed) recordAdminAction({ action: "legal.update", entityType: "LegalDocument", entityId: kind, details: `${parsed.data.locale}: version ${res.document.version}${parsed.data.content.trim() ? "" : " (removed)"}` });
  return Response.json(res.document, { headers });
}
