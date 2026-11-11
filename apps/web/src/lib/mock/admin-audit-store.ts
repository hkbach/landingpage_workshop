// SERVER-ONLY: the audit log of the platform, until apps/api exists. It keeps the trace of what the users do, so the admin team can find what happened when a user asks for support:
// a CUSTOMER (log in, register, book, cancel, check in, affiliate links, withdrawals, profile), a SHOP OWNER (workshops, sessions, bookings, payments, promotions, publishing the
// landing page), a GUEST who is not logged in (booking, confirming, cancelling, reporting a site) and a SYSTEM ADMIN (accounts, shops, sessions, fees, withdrawals, landing pages).
// Every line says who (name, email, role), what, on which record, in which shop (organization) and when; it is added to the demo lines of the audit log page.
// No secret ever goes in a line: never a password, a token, a link with a secret, a card number; only what was done and to which record.
// Lives on globalThis like the other mock stores. TODO(api): `audit_logs` written in the transaction of each action, with the actor of the session and the IP; kept for a long time,
// append only, readable by SUPER_ADMIN only.
import type { AuditEntry } from "../types";
import { newUuid } from "../uuid";
import { adminAuditLogs } from "./admin";

const g = globalThis as unknown as { __adminAudit?: AuditEntry[] };
const log = () => (g.__adminAudit ??= []);

/** Test helper: no line of this session. */
export function resetAdminAudit(): void {
  g.__adminAudit = [];
}

/** "ContactMessage", "contact message" and "contact_message" are the same record type: the audit log keeps one spelling (snake_case) so the filter finds them all. */
export const entityTypeKey = (t: string): string => t.trim().replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[\s-]+/g, "_").toLowerCase();

/** Who did it, as the helpers of audit-actors.ts give it. */
export type AuditActor = Pick<AuditEntry, "actor" | "actorEmail" | "actorRole" | "actorId">;

/** Writes one line (the newest first). `details` is cut to 200 characters. */
export function recordAudit(entry: AuditActor & { action: string; entityType: string; entityId: string; organizationId?: string; targetEmail?: string; details?: string }): void {
  const { details, ...rest } = entry;
  rest.entityType = entityTypeKey(rest.entityType);
  log().unshift({ id: `au-${newUuid().slice(0, 8)}`, createdAt: new Date().toISOString(), ...rest, ...(details ? { details: details.slice(0, 200) } : {}) });
}

/** The administrator's lines: the actor is the platform admin. */
export function recordAdminAction(entry: { action: string; entityType: string; entityId: string; organizationId?: string; targetEmail?: string; details?: string }): void {
  recordAudit({ actor: "Platform Admin", actorEmail: ADMIN_EMAIL, actorRole: "SYSTEM_ADMIN", actorId: "admin", ...entry });
}

/** The email of the system admin of the prototype (the role check is simulated until the real authentication is added). */
export const ADMIN_EMAIL = "admin@workshopkit.example";

/** The lines of this session, newest first, then the demo lines. */
export const liveAuditLogs = (): AuditEntry[] => [...log(), ...adminAuditLogs];
