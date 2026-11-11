import { apiError } from "@/lib/api-error";
import { checkIncomeRange, shopIncomeDetail } from "@/lib/mock/admin-income";

// The detail of the income of one shop: every payment the shop recorded with the fees the platform charged on it, and the statement of each month (the system closes the books at the end of the
// month and the shop pays the invoice the platform sends; sending the invoices is built later). SUPER_ADMIN only; TODO(api): check the role.
/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional) -> { shopId, shopName, currency, timezone, lines, months }. 404 for an unknown shop, 422 for a bad range. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/admin/income/[shopId]">) {
  const { shopId } = await ctx.params;
  const sp = new URL(request.url).searchParams;
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  const check = checkIncomeRange(from || undefined, to || undefined);
  if (check !== "OK") return apiError(422, "VALIDATION", "Please check the dates.", { fields: { [check === "ORDER" ? "to" : "from"]: check === "ORDER" ? "order" : "invalid" } });
  const detail = shopIncomeDetail(shopId, from || undefined, to || undefined);
  if (!detail) return apiError(404, "NOT_FOUND", "Shop not found.");
  return Response.json(detail, { headers: { "cache-control": "no-store" } });
}
