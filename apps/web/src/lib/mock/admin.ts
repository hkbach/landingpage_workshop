// Extra mock data for the platform admin area (the shared mock file is read-only). Replaced by API calls later.
import type { AbuseReport, AuditEntry } from "../types";
import { abuseReports, AUDIT_WHO, auditLogs } from "./data";

const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();

/** Mock per-organization numbers (workshops count, bookings in the last 30 days). */
export const orgStats: Record<string, { workshops: number; bookings30d: number }> = {
  "org-1": { workshops: 4, bookings30d: 128 },
  "org-2": { workshops: 2, bookings30d: 0 },
  "org-3": { workshops: 3, bookings30d: 17 },
  "org-4": { workshops: 3, bookings30d: 41 },
  "org-5": { workshops: 3, bookings30d: 23 },
};

const extraReports: AbuseReport[] = [
  { id: "ar-3", shopSlug: "sugarsift", reason: "INAPPROPRIATE", description: "Cover image is not related to the workshop.", reporterEmail: "visitor@example.com", status: "OPEN", createdAt: ago(30) },
  { id: "ar-4", shopSlug: "goldennoodle", reason: "PHISHING", description: "Booking confirmation asks to pay by an external link.", status: "OPEN", createdAt: ago(52) },
  { id: "ar-5", shopSlug: "whiskladle", reason: "SCAM", description: "Workshop was cancelled without notice.", reporterEmail: "guest@example.com", status: "RESOLVED", createdAt: ago(24 * 12) },
];

export const adminReports: AbuseReport[] = [...abuseReports, ...extraReports].sort((a, b) =>
  b.createdAt.localeCompare(a.createdAt),
);

type Generated = Omit<AuditEntry, "id" | "entityId" | "createdAt">;
const GENERATED: Generated[] = [
  { ...AUDIT_WHO.linh, action: "workshop.create", entityType: "workshop", organizationId: "org-1" },
  { ...AUDIT_WHO.emma, action: "auth.login", entityType: "user", organizationId: "org-1", details: "Logged in with email and password" },
  { ...AUDIT_WHO.linh, action: "session.close", entityType: "session", organizationId: "org-1" },
  { ...AUDIT_WHO.thu, action: "booking.create", entityType: "booking", organizationId: "org-1", details: "2 guests" },
  { ...AUDIT_WHO.minh, action: "shop.publish", entityType: "organization", organizationId: "org-2" },
  { ...AUDIT_WHO.an, action: "booking.cancel", entityType: "booking", organizationId: "org-3" },
  { ...AUDIT_WHO.yuki, action: "affiliate.register", entityType: "affiliate_link", organizationId: "org-1" },
  { ...AUDIT_WHO.admin, action: "user.reset_password", entityType: "user", organizationId: "org-1", targetEmail: "emma@example.com" },
  { ...AUDIT_WHO.emma, action: "booking.cancel", entityType: "booking", organizationId: "org-1", details: "Reason: My plans changed" },
  { ...AUDIT_WHO.hoang, action: "page.publish", entityType: "page", organizationId: "org-4" },
  { ...AUDIT_WHO.guest, action: "booking.create", entityType: "booking", organizationId: "org-1", details: "1 guest" },
  { ...AUDIT_WHO.thu, action: "withdrawal.request", entityType: "withdrawal", organizationId: "org-1", details: "Affiliate" },
  { ...AUDIT_WHO.linh, action: "page.publish", entityType: "page", organizationId: "org-1" },
  { ...AUDIT_WHO.yuki, action: "booking.check_in", entityType: "booking", organizationId: "org-1" },
];

const generated: AuditEntry[] = Array.from({ length: 28 }, (_, i) => {
  const g = GENERATED[i % GENERATED.length]!;
  return { id: `au-g${i + 1}`, ...g, entityId: `${g.entityType}-${i + 1}`, createdAt: ago(6 + i * 19) };
});

export const adminAuditLogs: AuditEntry[] = [...auditLogs, ...generated].sort((a, b) =>
  b.createdAt.localeCompare(a.createdAt),
);
