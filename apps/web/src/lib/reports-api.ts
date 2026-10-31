import type { HandleReportInput, ReportCounts, ReportFilter, ReportRecord } from "@workshop/shared";

// Browser side of the admin report endpoints (GET /api/v1/admin/reports, PATCH /api/v1/admin/reports/{id}).

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = "ApiError";
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { code?: string } } | null;
    throw new ApiError(res.status, body?.error?.code ?? "UNKNOWN");
  }
  return (await res.json()) as T;
}

export interface AdminReportsResponse {
  items: ReportRecord[];
  /** Summary over all reports (it does not change with the filters). */
  counts: ReportCounts;
  shops: string[];
}

/** Query string of a filter: only the parts that are set, so the default view is `""`. */
export function buildReportsQuery(f: ReportFilter): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.reason) p.set("reason", f.reason);
  if (f.shop) p.set("shop", f.shop);
  if (f.q?.trim()) p.set("q", f.q.trim());
  if (f.sort && f.sort !== "newest") p.set("sort", f.sort);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export async function fetchAdminReports(filter: ReportFilter): Promise<AdminReportsResponse> {
  return parse<AdminReportsResponse>(await fetch(`/api/v1/admin/reports${buildReportsQuery(filter)}`, { cache: "no-store" }));
}

export async function decideReportRequest(id: string, input: HandleReportInput): Promise<ReportRecord> {
  return parse<ReportRecord>(
    await fetch(`/api/v1/admin/reports/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}
