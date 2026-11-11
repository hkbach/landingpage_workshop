import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { DEMO_ORG, ownerActor } from "@/lib/mock/audit-actors";
import { currentShop } from "@/lib/mock/data";
import { getCustomDomain, setCustomDomain } from "@/lib/mock/shop-domain-store";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";

// The own domain of the shop (Settings of the shop owner): guests reach the landing page there instead of at {slug}.{PLATFORM_DOMAIN}, which keeps working. MOCK implementation inside Next
// until apps/api exists; the organization is the demo shop. TODO(api): the organization of the session, OWNER only, DNS check and certificate (see shop-domain-store.ts).
const headers = { "cache-control": "no-store" };
const bodySchema = z.object({ domain: z.string({ error: "required" }).max(300, "tooLong") });

const view = () => ({ domain: getCustomDomain(currentShop.slug), systemHost: `${currentShop.slug}.${PLATFORM_DOMAIN}` });

/** GET -> { domain: "" when none, systemHost }. */
export async function GET() {
  return Response.json(view(), { headers });
}

/** PUT { domain } -> 200 { domain, systemHost }. The text is cleaned (see checkCustomDomain); "" removes the domain. 422 `fields.domain` "invalid" | "platform" | "tooLong"; 409 DOMAIN_TAKEN when another shop has it. */
export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.", {}, headers);
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { domain: parsed.error.issues[0]?.message ?? "invalid" } }, headers);
  const before = getCustomDomain(currentShop.slug);
  const res = setCustomDomain(currentShop.slug, parsed.data.domain);
  if (!res.ok) {
    if (res.code === "TAKEN") return apiError(409, "DOMAIN_TAKEN", "This domain is already used by another shop.", {}, headers);
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { domain: res.code === "PLATFORM" ? "platform" : "invalid" } }, headers);
  }
  if (res.changed) recordAudit({ ...ownerActor(request), action: res.domain ? "shop.domain_set" : "shop.domain_remove", entityType: "Organization", entityId: currentShop.id, organizationId: DEMO_ORG, details: `${before || "-"} -> ${res.domain || "-"}` });
  return Response.json(view(), { headers });
}
