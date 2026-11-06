import { z } from "zod";
import { apiError, fieldCodes } from "@/lib/api-error";
import { liveShops } from "@/lib/mock/shop-admin-store";
import { recordClick } from "@/lib/mock/referral-store";

// Someone opened an affiliate link: the landing page of the shop tells the server once per visit, so the person who shared the link sees the clicks. MOCK implementation inside
// Next until apps/api exists. TODO(api): rate limit per IP, count a visitor once a day, no personal data kept.

const bodySchema = z.object({ code: z.string().trim().min(1, "required").max(40, "invalid") });

/** POST { code } -> 204. 404 for an unknown shop or link (the page ignores it), 422 with `fields`. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/public/sites/[slug]/referrals/click">) {
  const { slug } = await ctx.params;
  const shop = liveShops().find((s) => s.slug === slug && s.status === "ACTIVE");
  if (!shop) return apiError(404, "NOT_FOUND", "Shop not found.");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: fieldCodes(parsed.error.issues) });
  if (!recordClick(parsed.data.code, shop.id)) return apiError(404, "NOT_FOUND", "Link not found.");
  return new Response(null, { status: 204 });
}
