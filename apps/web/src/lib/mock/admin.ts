// Extra mock data for the platform admin area (the shared mock file is read-only). Replaced by API calls later.
import type { AbuseReport, AuditEntry } from "../types";
import { abuseReports, auditLogs } from "./data";

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

/** Mock per-organization numbers (workshops count, bookings in the last 30 days). */
export const orgStats: Record<string, { workshops: number; bookings30d: number }> = {
  "org-1": { workshops: 4, bookings30d: 128 },
  "org-2": { workshops: 2, bookings30d: 0 },
  "org-3": { workshops: 3, bookings30d: 17 },
};

const extraReports: AbuseReport[] = [
  { id: "ar-3", shopSlug: "sugarsift", reason: "INAPPROPRIATE", description: "Cover image is not related to the workshop.", reporterEmail: "visitor@example.com", status: "OPEN", createdAt: ago(30) },
  { id: "ar-4", shopSlug: "goldennoodle", reason: "PHISHING", description: "Booking confirmation asks to pay by an external link.", status: "OPEN", createdAt: ago(52) },
  { id: "ar-5", shopSlug: "whiskladle", reason: "SCAM", description: "Workshop was cancelled without notice.", reporterEmail: "guest@example.com", status: "RESOLVED", createdAt: ago(24 * 12) },
];

export const adminReports: AbuseReport[] = [...abuseReports, ...extraReports].sort((a, b) =>
  b.createdAt.localeCompare(a.createdAt),
);

const GENERATED: Array<Pick<AuditEntry, "actor" | "action" | "entityType" | "organizationId">> = [
  { actor: "Linh Tran", action: "workshop.create", entityType: "workshop", organizationId: "org-1" },
  { actor: "Linh Tran", action: "session.cancel", entityType: "session", organizationId: "org-1" },
  { actor: "Minh Pham", action: "page.submit_review", entityType: "organization", organizationId: "org-2" },
  { actor: "An Nguyen", action: "booking.cancel", entityType: "booking", organizationId: "org-3" },
  { actor: "Platform Admin", action: "organization.reject", entityType: "organization", organizationId: "org-2" },
  { actor: "Linh Tran", action: "page.publish", entityType: "page", organizationId: "org-1" },
];

const generated: AuditEntry[] = Array.from({ length: 22 }, (_, i) => {
  const g = GENERATED[i % GENERATED.length]!;
  return { id: `au-g${i + 1}`, ...g, entityId: `${g.entityType}-${i + 1}`, createdAt: ago(6 + i * 19) };
});

export const adminAuditLogs: AuditEntry[] = [...auditLogs, ...generated].sort((a, b) =>
  b.createdAt.localeCompare(a.createdAt),
);
