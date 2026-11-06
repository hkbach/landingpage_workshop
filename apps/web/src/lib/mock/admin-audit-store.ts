// SERVER-ONLY: the audit log of what a system administrator does in the admin area (edit or deactivate an account, reset a password, deactivate a shop, close a session,
// change the fees, edit a landing page), until apps/api exists. It is added to the demo entries of the audit log page. No secret ever goes in an entry: only what was done
// and to which record. Lives on globalThis like the other mock stores. TODO(api): `audit_logs` written in the transaction of each action, with the actor of the session and the IP.
import type { AuditEntry } from "../types";
import { newUuid } from "../uuid";
import { adminAuditLogs } from "./admin";

const g = globalThis as unknown as { __adminAudit?: AuditEntry[] };
const log = () => (g.__adminAudit ??= []);

/** Test helper: no entry of an administrator. */
export function resetAdminAudit(): void {
  g.__adminAudit = [];
}

export function recordAdminAction(entry: { action: string; entityType: string; entityId: string; organizationId?: string }): void {
  log().unshift({ id: `au-${newUuid().slice(0, 8)}`, actor: "Platform Admin", createdAt: new Date().toISOString(), ...entry });
}

/** The entries of the administrators of this session, newest first, then the demo entries. */
export const liveAuditLogs = (): AuditEntry[] => [...log(), ...adminAuditLogs];
