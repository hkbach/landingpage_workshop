// SERVER-ONLY stand-in for the reports table (abuse_reports) until apps/api exists.
// The landing page (shop subdomain) and the admin area (app host) are different browser origins, so they cannot share
// localStorage; both talk to the same Next server through the route handlers under /api/v1, which use this in-memory store.
// It lives on globalThis so it survives hot reloads, and it is lost when the server restarts (it is demo data).
import { filterReports, type CreateReportInput, type HandleReportInput, type ReportFilter, type ReportRecord } from "@workshop/shared";
import { newUuid } from "@/lib/uuid";
import { adminReports } from "./admin";

interface Store {
  reports: ReportRecord[];
  /** Successful submissions per client, newest last (rate limit). */
  hits: Map<string, number[]>;
}

const g = globalThis as unknown as { __reportStore?: Store };

function seed(): Store {
  return { reports: adminReports.map((r) => ({ ...r })), hits: new Map() };
}
function store(): Store {
  return (g.__reportStore ??= seed());
}

/** Test helper: back to the seed data. */
export function resetReportStore(): void {
  g.__reportStore = seed();
}

/** Rate limit of POST /public/sites/{slug}/reports: 5 reports per hour per client (REQUIREMENTS 9.3). */
export const REPORT_RATE_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 } as const;

function recentHits(key: string, now: number): number[] {
  const hits = (store().hits.get(key) ?? []).filter((t) => now - t < REPORT_RATE_LIMIT.windowMs);
  store().hits.set(key, hits);
  return hits;
}

/** Seconds until the client may report again, or 0 when it may. */
export function retryAfterSeconds(key: string, now = Date.now()): number {
  const hits = recentHits(key, now);
  if (hits.length < REPORT_RATE_LIMIT.max) return 0;
  return Math.max(1, Math.ceil((hits[0]! + REPORT_RATE_LIMIT.windowMs - now) / 1000));
}

export function recordHit(key: string, now = Date.now()): void {
  for (const [k, times] of store().hits) if (times.every((t) => now - t >= REPORT_RATE_LIMIT.windowMs)) store().hits.delete(k); // forget the clients whose window is over
  recentHits(key, now).push(now);
}

export function addReport(shopSlug: string, input: CreateReportInput, now = new Date()): ReportRecord {
  const report: ReportRecord = {
    id: `rp-${newUuid()}`,
    shopSlug,
    reason: input.reason,
    description: input.description,
    ...(input.email ? { reporterEmail: input.email } : {}),
    status: "OPEN",
    createdAt: now.toISOString(),
  };
  store().reports.push(report);
  return report;
}

export function allReports(): ReportRecord[] {
  return store().reports.map((r) => ({ ...r }));
}

export function queryReports(filter: ReportFilter): ReportRecord[] {
  return filterReports(allReports(), filter);
}

export type DecideResult =
  | { ok: true; report: ReportRecord }
  | { ok: false; code: "NOT_FOUND" | "INVALID_TRANSITION" };

/** OPEN -> RESOLVED | DISMISSED. Anything else is an invalid transition. */
export function decideReport(id: string, input: HandleReportInput, by = "Platform Admin", now = new Date()): DecideResult {
  const report = store().reports.find((r) => r.id === id);
  if (!report) return { ok: false, code: "NOT_FOUND" };
  if (report.status !== "OPEN") return { ok: false, code: "INVALID_TRANSITION" };
  report.status = input.status;
  report.handledAt = now.toISOString();
  report.handledBy = by;
  if (input.note) report.note = input.note;
  return { ok: true, report: { ...report } };
}
