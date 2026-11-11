import { z } from "zod";
import { promotionInputSchema } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { saveFailure } from "@/lib/promotion-http";
import { deletePromotion, setPromotionEnabled, updatePromotion } from "@/lib/mock/promotion-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { ownerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// One promotion of the shop. MOCK implementation inside Next until apps/api exists (same TODO(api) as the collection route).

const pauseSchema = z.object({ enabled: z.boolean() });

async function readJson(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; res: Response }> {
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, res: apiError(400, "BAD_REQUEST", "The request body must be JSON.") };
  }
}
const validation = (issues: { path: PropertyKey[]; message: string }[]) =>
  apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(issues) });

/** PUT: replace the promotion with the full body. */
export async function PUT(request: Request, ctx: RouteContext<"/api/v1/promotions/[id]">) {
  const { id } = await ctx.params;
  const json = await readJson(request);
  if (!json.ok) return json.res;
  const parsed = promotionInputSchema.safeParse(json.body);
  if (!parsed.success) return validation(parsed.error.issues);
  const res = updatePromotion(id, parsed.data);
  if (res.ok) recordAudit({ ...ownerActor(), action: "promotion.update", entityType: "Promotion", entityId: id, organizationId: DEMO_ORG });
  return res.ok ? Response.json(res.promotion) : saveFailure(res);
}

/** PATCH { enabled }: pause or resume without touching anything else. Pausing is refused (409 PROMOTION_IN_USE) while guests use it in bookings of sessions that have not ended; resuming is refused when more than 5 would run at once or a workshop would be free. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/promotions/[id]">) {
  const { id } = await ctx.params;
  const json = await readJson(request);
  if (!json.ok) return json.res;
  const parsed = pauseSchema.safeParse(json.body);
  if (!parsed.success) return validation(parsed.error.issues);
  const res = setPromotionEnabled(id, parsed.data.enabled);
  if (res.ok) recordAudit({ ...ownerActor(), action: parsed.data.enabled ? "promotion.resume" : "promotion.pause", entityType: "Promotion", entityId: id, organizationId: DEMO_ORG });
  return res.ok ? Response.json(res.promotion) : saveFailure(res);
}

/** DELETE: 204; 404 when it does not exist; 409 DELETE_NOT_ALLOWED unless the promotion is paused or over. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/v1/promotions/[id]">) {
  const { id } = await ctx.params;
  const res = deletePromotion(id);
  if (res.ok) {
    recordAudit({ ...ownerActor(), action: "promotion.delete", entityType: "Promotion", entityId: id, organizationId: DEMO_ORG });
    return new Response(null, { status: 204 });
  }
  return res.code === "NOT_FOUND"
    ? apiError(404, "NOT_FOUND", "Promotion not found.")
    : apiError(409, "DELETE_NOT_ALLOWED", "Only a paused or expired promotion can be deleted. Pause it first.");
}
