import { apiError } from "@/lib/api-error";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";
import { currentShop } from "@/lib/mock/data";
import { liveShops } from "@/lib/mock/shop-admin-store";

// A system administrator opens the landing page builder of a shop in admin mode: the audit log records that the edits that follow are made by an administrator, not by the
// shop owner. MOCK implementation inside Next until apps/api exists. The mock has the builder data of the demo shop only. TODO(api): SUPER_ADMIN only; every save of the page
// by an administrator is audited with the page id and the actor of the session.

/** POST -> 204. 404 unknown shop, 409 NOT_EDITABLE for a shop that has no builder data in the mock. */
export async function POST(_request: Request, ctx: RouteContext<"/api/v1/admin/landing-pages/[slug]/audit">) {
  const { slug } = await ctx.params;
  const shop = liveShops().find((s) => s.slug === slug);
  if (!shop) return apiError(404, "NOT_FOUND", "Shop not found.");
  if (shop.id !== currentShop.id) return apiError(409, "NOT_EDITABLE", "This shop has no landing page to edit yet.");
  recordAdminAction({ action: "landing_page.edit", entityType: "landing_page", entityId: slug, organizationId: shop.id });
  return new Response(null, { status: 204 });
}
