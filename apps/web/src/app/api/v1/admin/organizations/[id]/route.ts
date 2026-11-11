import { z } from "zod";
import { LOCALES } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { getCustomDomain, setCustomDomain } from "@/lib/mock/shop-domain-store";
import { liveShop, updateShopProfile } from "@/lib/mock/shop-admin-store";

// An administrator edits a shop: its profile (name, contact, address, region, languages) and its own domain, never its slug. MOCK implementation inside Next until apps/api exists.
// TODO(api): SUPER_ADMIN only, one transaction. Changing the timezone or the currency does not convert what exists (bookings, sessions and prices keep their values).
const valid = (kind: "tz" | "cur") => (v: string) => {
  try {
    if (kind === "tz") new Intl.DateTimeFormat("en", { timeZone: v });
    else return (Intl.supportedValuesOf("currency") as string[]).includes(v);
    return true;
  } catch {
    return false;
  }
};
const localeEnum = z.enum(LOCALES, { error: "invalid" });
const bodySchema = z
  .object({
    name: z.string({ error: "required" }).trim().min(1, "required").max(120, "tooLong"),
    contactEmail: z.string({ error: "required" }).trim().min(1, "required").max(254, "tooLong").pipe(z.email("invalid")),
    contactPhone: z.string({ error: "required" }).trim().min(5, "required").max(30, "tooLong"),
    whatsapp: z.string().trim().max(30, "tooLong").default(""),
    address: z.string({ error: "required" }).trim().min(1, "required").max(300, "tooLong"),
    mapsUrl: z.string().trim().max(500, "tooLong").refine((v) => v === "" || /^https:\/\/\S+$/.test(v), "invalid").default(""),
    country: z.string({ error: "required" }).regex(/^[A-Z]{2}$/, "invalid"),
    timezone: z.string({ error: "required" }).refine(valid("tz"), "invalid"),
    currency: z.string({ error: "required" }).regex(/^[A-Z]{3}$/, "invalid").refine(valid("cur"), "invalid"),
    defaultLocale: localeEnum,
    enabledLocales: z.array(localeEnum, "invalid").min(1, "invalid"),
    customDomain: z.string().max(300, "tooLong").default(""),
  })
  .refine((v) => v.enabledLocales.includes(v.defaultLocale), { path: ["enabledLocales"], message: "defaultMustBeEnabled" });

/** PATCH the whole profile -> 200 { id, changed: [field names], customDomain }. 422 `fields` ("required" | "invalid" | "tooLong" | "defaultMustBeEnabled", `customDomain`: "invalid" | "platform"), 409 DOMAIN_TAKEN, 404. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/admin/organizations/[id]">) {
  const { id } = await ctx.params;
  const shop = liveShop(id);
  if (!shop) return apiError(404, "NOT_FOUND", "Organization not found.");
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
  const { customDomain, ...profile } = parsed.data;
  const domainBefore = getCustomDomain(shop.slug);
  const dom = setCustomDomain(shop.slug, customDomain); // checked first: when it is refused nothing else is saved
  if (!dom.ok) {
    if (dom.code === "TAKEN") return apiError(409, "DOMAIN_TAKEN", "This domain is already used by another shop.");
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { customDomain: dom.code === "PLATFORM" ? "platform" : "invalid" } });
  }
  const res = updateShopProfile(id, profile);
  if (!res.ok) return apiError(404, "NOT_FOUND", "Organization not found.");
  if (res.changed.length) recordAdminAction({ action: "shop.profile_update", entityType: "Organization", entityId: id, organizationId: id, targetEmail: shop.ownerEmail, details: `changed: ${res.changed.join(", ")}` });
  if (dom.changed) recordAdminAction({ action: dom.domain ? "shop.domain_set" : "shop.domain_remove", entityType: "Organization", entityId: id, organizationId: id, targetEmail: shop.ownerEmail, details: `${domainBefore || "-"} -> ${dom.domain || "-"}` });
  return Response.json({ id, changed: res.changed, customDomain: dom.domain });
}
