import { countReports, isReportReason, isReportStatus, type ReportFilter } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { allReports, queryReports } from "@/lib/mock/report-store";

// GET /api/v1/admin/reports?status=&reason=&shop=&q=&sort=: the report management list (SUPER_ADMIN only).
// MOCK implementation inside Next until apps/api exists. TODO(api): require a SUPER_ADMIN session; this mock has no auth.

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const filter: ReportFilter = {};

  const status = sp.get("status");
  if (status) {
    if (!isReportStatus(status)) return apiError(422, "VALIDATION", "Unknown status.", { fields: { status: "invalid" } });
    filter.status = status;
  }
  const reason = sp.get("reason");
  if (reason) {
    if (!isReportReason(reason)) return apiError(422, "VALIDATION", "Unknown reason.", { fields: { reason: "invalid" } });
    filter.reason = reason;
  }
  const sort = sp.get("sort");
  if (sort) {
    if (sort !== "newest" && sort !== "oldest") return apiError(422, "VALIDATION", "Unknown sort order.", { fields: { sort: "invalid" } });
    filter.sort = sort;
  }
  const shop = sp.get("shop")?.slice(0, 60);
  if (shop) filter.shop = shop;
  const q = sp.get("q")?.slice(0, 120);
  if (q) filter.q = q;

  const everything = allReports();
  return Response.json({
    items: queryReports(filter),
    // The summary and the shop list ignore the filters, so the counters do not change while the admin filters.
    counts: countReports(everything),
    shops: [...new Set(everything.map((r) => r.shopSlug))].sort(),
  });
}
