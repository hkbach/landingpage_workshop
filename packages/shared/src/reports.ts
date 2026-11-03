import { z } from "zod";

// Reports of a landing page ("Report this site", FR-ADM-04): sent by travellers, handled by a platform admin.
// Validation messages are codes (the UI turns them into translated text).

export const REPORT_REASONS = ["SCAM", "PHISHING", "INAPPROPRIATE", "OTHER"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** A report can only leave OPEN, and only to one of these two. */
export const REPORT_DECISIONS = ["RESOLVED", "DISMISSED"] as const;
export type ReportDecision = (typeof REPORT_DECISIONS)[number];

export const REPORT_DESCRIPTION_MIN = 10;
export const REPORT_DESCRIPTION_MAX = 2000;
export const REPORT_NOTE_MAX = 500;

/** Body of POST /public/sites/{slug}/reports. The email is optional (anonymous reports are allowed). */
export const createReportSchema = z.object({
  reason: z.enum(REPORT_REASONS, "required"),
  description: z.string().trim().min(REPORT_DESCRIPTION_MIN, "descriptionShort").max(REPORT_DESCRIPTION_MAX, "tooLong"),
  email: z
    .string()
    .trim()
    .max(120, "tooLong")
    .refine((v) => v === "" || z.email().safeParse(v).success, "email")
    .optional(),
});
export type CreateReportInput = z.infer<typeof createReportSchema>;

/** Body of PATCH /admin/reports/{id}. */
export const handleReportSchema = z.object({
  status: z.enum(REPORT_DECISIONS, "required"),
  note: z.string().trim().max(REPORT_NOTE_MAX, "tooLong").optional(),
});
export type HandleReportInput = z.infer<typeof handleReportSchema>;

/** One report as the admin area sees it. */
export interface ReportRecord {
  id: string;
  shopSlug: string;
  reason: ReportReason;
  description: string;
  reporterEmail?: string;
  status: ReportStatus;
  createdAt: string;
  /** Set when an admin resolved or dismissed it. */
  handledAt?: string;
  handledBy?: string;
  note?: string;
}

export interface ReportFilter {
  status?: ReportStatus;
  reason?: ReportReason;
  shop?: string;
  /** Free text, matched against the description, the reporter's email and the shop slug. */
  q?: string;
  sort?: "newest" | "oldest";
}

export const isReportStatus = (v: unknown): v is ReportStatus => (REPORT_STATUSES as readonly unknown[]).includes(v);
export const isReportReason = (v: unknown): v is ReportReason => (REPORT_REASONS as readonly unknown[]).includes(v);

/** Pure filter + sort used by the (mock) API and by tests; the real API does the same in SQL. */
export function filterReports(reports: readonly ReportRecord[], f: ReportFilter): ReportRecord[] {
  const q = f.q?.trim().toLowerCase();
  const rows = reports.filter((r) =>
    (!f.status || r.status === f.status) &&
    (!f.reason || r.reason === f.reason) &&
    (!f.shop || r.shopSlug === f.shop) &&
    (!q || r.description.toLowerCase().includes(q) || (r.reporterEmail ?? "").toLowerCase().includes(q) || r.shopSlug.toLowerCase().includes(q)),
  );
  const dir = f.sort === "oldest" ? 1 : -1;
  return rows.sort((a, b) => dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt)));
}

export interface ReportCounts { total: number; OPEN: number; RESOLVED: number; DISMISSED: number }

export function countReports(reports: readonly ReportRecord[]): ReportCounts {
  const counts: ReportCounts = { total: reports.length, OPEN: 0, RESOLVED: 0, DISMISSED: 0 };
  for (const r of reports) counts[r.status]++;
  return counts;
}
