import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { ratesError, ratesSchema } from "@/lib/fee-rates-api";
import { applyRatesToAll } from "@/lib/mock/fee-rates-store";
import { liveShops } from "@/lib/mock/shop-admin-store";

// Bulk action: the same rates for every shop, or for the shops named in `shopIds`. All or none. SUPER_ADMIN only; TODO(api): check the role, one transaction, audit log.

const bodySchema = ratesSchema.extend({ shopIds: z.array(z.string()).optional() });

/** POST { maintenanceBps, serviceBps, referralBps, shopIds? } -> 200 { applied }. 422 with `fields` naming the rate that is wrong (nothing is saved), 404 an unknown shop. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), "invalid"])) });
  const known = liveShops().map((s) => s.id);
  const { shopIds, ...rates } = parsed.data;
  if (shopIds?.some((id) => !known.includes(id))) return apiError(404, "NOT_FOUND", "Organization not found.");
  const ids = shopIds ?? known;
  const check = applyRatesToAll(ids, rates);
  if (check !== "OK") return ratesError(check);
  recordAdminAction({ action: "fees.bulk_update", entityType: "organization", entityId: ids.length === known.length ? "all" : ids.join(",") });
  return Response.json({ applied: ids.length });
}
