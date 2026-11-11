import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { ratesError, ratesSchema } from "@/lib/fee-rates-api";
import { getFeeRates, getInviteBonusBps, getReferralBps, setAllRates } from "@/lib/mock/fee-rates-store";
import { liveShops } from "@/lib/mock/shop-admin-store";

// The three rates of ONE shop. SUPER_ADMIN only; TODO(api): check the role, audit log with the old and the new rates.

/** PUT { maintenanceBps, serviceBps, referralBps, inviteBonusBps? } -> 200 the saved rates. 404 unknown shop, 422 with `fields` naming the rate that is wrong. */
export async function PUT(request: Request, ctx: RouteContext<"/api/v1/admin/fees/[id]">) {
  const { id } = await ctx.params;
  if (!liveShops().some((s) => s.id === id)) return apiError(404, "NOT_FOUND", "Organization not found.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = ratesSchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), "invalid"])) });
  const check = setAllRates(id, parsed.data);
  if (check !== "OK") return ratesError(check);
  recordAdminAction({ action: "fees.update", entityType: "organization", entityId: id, organizationId: id });
  return Response.json({ shopId: id, ...getFeeRates(id), referralBps: getReferralBps(id), inviteBonusBps: getInviteBonusBps(id) });
}
