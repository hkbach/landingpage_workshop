import { z } from "zod";
import { apiError } from "@/lib/api-error";
import { shops } from "@/lib/mock/data";
import { getFeeRates, setFeeRates } from "@/lib/mock/fee-rates-store";

// The fees taken from the income of ONE shop: a maintenance fee and a service fee, as basis points (SUPER_ADMIN only; TODO(api): check the role,
// write an audit log). Each shop has its own rates.

const bodySchema = z.object({ maintenanceBps: z.number({ error: "invalid" }), serviceBps: z.number({ error: "invalid" }) });
const NOT_FOUND = () => apiError(404, "NOT_FOUND", "Organization not found.");

export async function GET(_request: Request, ctx: RouteContext<"/api/v1/admin/organizations/[id]/finance-settings">) {
  const { id } = await ctx.params;
  if (!shops.some((s) => s.id === id)) return NOT_FOUND();
  return Response.json(getFeeRates(id), { headers: { "cache-control": "no-store" } });
}

/** PUT { maintenanceBps, serviceBps } -> 200 the saved rates of this shop. 404 unknown shop, 422 with `fields` naming the rate that is wrong. */
export async function PUT(request: Request, ctx: RouteContext<"/api/v1/admin/organizations/[id]/finance-settings">) {
  const { id } = await ctx.params;
  if (!shops.some((s) => s.id === id)) return NOT_FOUND();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields: { maintenanceBps: "invalid", serviceBps: "invalid" } });
  const check = setFeeRates(id, parsed.data);
  if (check === "MAINTENANCE_INVALID") return apiError(422, "VALIDATION", "The maintenance fee must be from 0% to 100%.", { fields: { maintenanceBps: "invalid" } });
  if (check === "SERVICE_INVALID") return apiError(422, "VALIDATION", "The service fee must be from 0% to 100%.", { fields: { serviceBps: "invalid" } });
  if (check === "TOTAL_TOO_HIGH") return apiError(422, "VALIDATION", "The two fees together cannot be more than 100%.", { fields: { serviceBps: "totalTooHigh" } });
  return Response.json(getFeeRates(id));
}
