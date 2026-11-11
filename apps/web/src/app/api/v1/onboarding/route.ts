import { z } from "zod";
import { LOCALES } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor } from "@/lib/mock/audit-actors";
import { completeOnboarding } from "@/lib/mock/registered-shops-store";

// The owner of a shop that just signed up finishes its setup (the wizard of /shopowner/onboarding?shop={slug}): region, languages and contact. POST { slug, country, timezone, currency,
// defaultLocale, enabledLocales, contactEmail, contactPhone, whatsapp?, address, mapsUrl? } -> 200 { slug }. 422 with `fields`; 404 for a slug that is not a shop that signed up (the demo shops
// are set up already); 409 ALREADY_DONE the second time. MOCK implementation inside Next until apps/api exists.
// TODO(api): the organization of the session (never a slug of the body), OWNER only, the changes and the audit line in one transaction.
const text = (min: number, max: number) => z.string({ error: "required" }).trim().min(min, "required").max(max, "tooLong");
const timeZones = new Set(Intl.supportedValuesOf("timeZone"));
const currencies = new Set(Intl.supportedValuesOf("currency"));
const bodySchema = z.object({
  slug: text(1, 63),
  country: z.string({ error: "required" }).regex(/^[A-Z]{2}$/, "invalid"),
  timezone: z.string({ error: "required" }).refine((v) => timeZones.has(v), "invalid"),
  currency: z.string({ error: "required" }).refine((v) => currencies.has(v), "invalid"),
  defaultLocale: z.enum(LOCALES, { error: "invalid" }),
  enabledLocales: z.array(z.enum(LOCALES), { error: "invalid" }).min(1, "invalid"),
  contactEmail: text(1, 254).pipe(z.email("invalid")),
  contactPhone: text(5, 30),
  whatsapp: z.string().trim().max(30, "tooLong").optional().default(""),
  address: text(1, 300),
  mapsUrl: z.string().trim().max(500, "tooLong").refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "invalid").optional().default(""),
}).refine((v) => v.enabledLocales.includes(v.defaultLocale), { path: ["enabledLocales"], message: "invalid" });

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }
  const { slug, ...input } = parsed.data;
  const res = completeOnboarding(slug, { ...input, enabledLocales: [...new Set(input.enabledLocales)] });
  if (!res.ok) return res.code === "NOT_FOUND" ? apiError(404, "NOT_FOUND", "Shop not found.") : apiError(409, "ALREADY_DONE", "The setup of this shop is finished already.");
  recordAudit({ ...ownerActor(request, res.shop.id), action: "shop.onboarding", entityType: "Organization", entityId: res.shop.id, organizationId: res.shop.id, details: `${res.shop.country} ${res.shop.currency}; ${res.shop.enabledLocales.join(",")}` });
  return Response.json({ slug: res.shop.slug }, { headers: { "cache-control": "no-store" } });
}
