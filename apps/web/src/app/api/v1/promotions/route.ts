import { MAX_PROMOTIONS_PER_SHOP, promotionInputSchema } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { allPromotions, createPromotion, shopToday } from "@/lib/mock/promotion-store";

// Promotions of the signed-in shop (shop owner). MOCK implementation inside Next until apps/api exists.
// TODO(api): require an OWNER / MANAGER session, filter by organization_id from it, and write an audit entry on every change.

/** GET /api/v1/promotions: every promotion of the shop, newest first, with today's date in the shop timezone for the status. */
export async function GET() {
  const items = allPromotions().sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  return Response.json({ items, today: shopToday(), limit: MAX_PROMOTIONS_PER_SHOP });
}

/** POST /api/v1/promotions: 201 with the promotion, 422 with `details.fields`, 409 when the shop has the maximum number. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = promotionInputSchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }
  const res = createPromotion(parsed.data);
  if (!res.ok) {
    return res.code === "LIMIT"
      ? apiError(409, "LIMIT_REACHED", `A shop can have at most ${MAX_PROMOTIONS_PER_SHOP} promotions.`)
      : apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { workshopIds: "workshopUnknown" } });
  }
  return Response.json(res.promotion, { status: 201 });
}
