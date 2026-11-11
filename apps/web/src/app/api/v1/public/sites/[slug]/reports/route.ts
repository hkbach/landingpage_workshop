import { createReportSchema } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { getPublicSite } from "@/lib/mock/site";
import { addReport, recordHit, retryAfterSeconds } from "@/lib/mock/report-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { guestActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// POST /api/v1/public/sites/{slug}/reports: "Report this site" on a landing page (no account, no auth).
// MOCK implementation inside Next until apps/api exists; the contract (path, body, error format, limits) is the real one.
// The real API also verifies the Cloudflare Turnstile token; the form shows a placeholder for it for now.

const MAX_BODY_CHARS = 10_000;

function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export async function POST(request: Request, ctx: RouteContext<"/api/v1/public/sites/[slug]/reports">) {
  const { slug } = await ctx.params;

  // Only a published (ACTIVE) site can be reported; anything else looks the same as a site that does not exist.
  if (!getPublicSite(slug)) return apiError(404, "NOT_FOUND", "Site not found.");

  const client = clientKey(request);
  const wait = retryAfterSeconds(client);
  if (wait > 0) {
    return apiError(429, "RATE_LIMITED", "Too many reports. Please try again later.", { retryAfterSeconds: wait }, { "Retry-After": String(wait) });
  }

  const text = await request.text();
  if (text.length > MAX_BODY_CHARS) return apiError(413, "PAYLOAD_TOO_LARGE", "The report is too large.");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return apiError(400, "BAD_REQUEST", "The request body must be JSON.");
  }

  const parsed = createReportSchema.safeParse(body);
  if (!parsed.success) {
    const fields = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0] ?? "body"), i.message]));
    return apiError(422, "VALIDATION", "Please check the highlighted fields.", { fields });
  }

  const report = addReport(slug, parsed.data);
  recordAudit({ ...guestActor(undefined), action: "report.submit", entityType: "Report", entityId: report.id, organizationId: DEMO_ORG });
  recordHit(client); // only reports that were accepted count towards the limit, so a typo never locks anybody out
  return Response.json({ id: report.id }, { status: 201 });
}
