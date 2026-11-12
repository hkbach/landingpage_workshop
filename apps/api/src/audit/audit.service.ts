import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import { DB, type Database, type Executor } from "../db/db.module";
import { auditLogs } from "../db/schema";

export interface AuditEntry {
  organizationId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** The fields that may never be written to the audit log, whatever a caller passes (REQUIREMENTS 8.6: no secret ever goes in a line). */
const SECRET_KEYS = /password|token|secret|cookie|authorization|hash|apikey|api_key/i;

/** A copy of a value without the keys that look like secrets (deep, at most 4 levels). */
export function withoutSecrets(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== "object" || depth > 4) return value;
  if (Array.isArray(value)) return value.map((v) => withoutSecrets(v, depth + 1));
  return Object.fromEntries(Object.entries(value).filter(([k]) => !SECRET_KEYS.test(k)).map(([k, v]) => [k, withoutSecrets(v, depth + 1)]));
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Writes one audit line, in the transaction of the change when `executor` is that transaction. */
  async record(entry: AuditEntry, executor: Executor = this.db): Promise<void> {
    await executor.insert(auditLogs).values({
      organizationId: entry.organizationId ?? null,
      actorUserId: entry.actorUserId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: entry.before === undefined ? null : withoutSecrets(entry.before),
      after: entry.after === undefined ? null : withoutSecrets(entry.after),
      ip: entry.ip ?? null,
    });
  }

  /**
   * The audit lines of ONE organization, newest first, with a cursor (`created_at` + `id` of the last line seen). The time is compared at the millisecond, which is all a cursor
   * (a JSON string) can carry; the id breaks the ties, so no line is skipped or shown twice.
   */
  async listForOrganization(organizationId: string, limit: number, cursor?: { createdAt: Date; id: string }) {
    const at = sql`date_trunc('milliseconds', ${auditLogs.createdAt})`;
    const conditions: SQL[] = [eq(auditLogs.organizationId, organizationId)];
    if (cursor) {
      const older = or(sql`${at} < ${cursor.createdAt.toISOString()}::timestamptz`, and(sql`${at} = ${cursor.createdAt.toISOString()}::timestamptz`, lt(auditLogs.id, cursor.id)));
      if (older) conditions.push(older);
    }
    return this.db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(at), desc(auditLogs.id)).limit(limit + 1);
  }
}
