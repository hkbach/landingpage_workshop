import { handleReportSchema } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { decideReport } from "@/lib/mock/report-store";
import { recordAdminAction } from "@/lib/mock/admin-audit-store";

// PATCH /api/v1/admin/reports/{id}: resolve or dismiss an OPEN report, with an optional note (SUPER_ADMIN only).
// MOCK implementation inside Next until apps/api exists. TODO(api): require a SUPER_ADMIN session and write an audit entry.

export async function PATCH(request: Request, ctx: RouteContext<"/api/v1/admin/reports/[id]">) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }
  const parsed = handleReportSchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }

  const result = decideReport(id, parsed.data);
  if (!result.ok) {
    return result.code === "NOT_FOUND"
      ? apiError(404, "NOT_FOUND", "Report not found.")
      : apiError(409, "INVALID_TRANSITION", "Only an open report can be resolved or dismissed.");
  }
  recordAdminAction({ action: `report.${parsed.data.status === "RESOLVED" ? "resolve" : "dismiss"}`, entityType: "Report", entityId: id });
  return Response.json(result.report);
}
