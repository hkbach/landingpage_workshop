import { MAX_CONCURRENT_PROMOTIONS, MAX_PROMOTIONS_PER_SHOP, promotionInputSchema } from "@workshop/shared";
import { apiError, fieldCodes } from "@/lib/api-error";
import { saveFailure } from "@/lib/promotion-http";
import { allPromotions, createPromotion, shopToday } from "@/lib/mock/promotion-store";

// Promotions of the signed-in shop (shop owner). MOCK implementation inside Next until apps/api exists.
// TODO(api): require an OWNER / MANAGER session, filter by organization_id from it, and write an audit entry on every change.

/** GET /api/v1/promotions: every promotion of the shop, newest first, with today's date in the shop timezone (the status depends on it) and the limits. */
export async function GET() {
  const items = allPromotions().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return Response.json({ items, today: shopToday(), limit: MAX_PROMOTIONS_PER_SHOP, maxConcurrent: MAX_CONCURRENT_PROMOTIONS });
}

/** POST /api/v1/promotions: 201 with the promotion, 422 with `details.fields`, 409 LIMIT_REACHED or CONCURRENT_LIMIT (more than 5 would run at once). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = promotionInputSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  }
  const res = createPromotion(parsed.data);
  if (!res.ok) return saveFailure(res);
  return Response.json(res.promotion, { status: 201 });
}
