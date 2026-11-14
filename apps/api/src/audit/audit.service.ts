import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
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

/**
 * The time of a line written to the microsecond, as text. The database keeps microseconds and a JavaScript date only milliseconds, so a cursor made from a date could not tell two lines of the same
 * millisecond apart. With this text the cursor is exact, and the lines can be sorted by the plain columns `(created_at, id)`, which an index serves (sorting by a truncated time could not use one).
 */
export const AUDIT_TS = sql<string>`to_char(${auditLogs.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const TS_FORMAT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;
const UUID_FORMAT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAuditCursor = (ts: unknown, id: unknown): boolean => typeof ts === "string" && TS_FORMAT.test(ts) && typeof id === "string" && UUID_FORMAT.test(id);
/** Lines older than the one of the cursor, in the order `created_at desc, id desc` (a row comparison: one range of the index). */
export const auditOlderThan = (ts: string, id: string): SQL => sql`(${auditLogs.createdAt}, ${auditLogs.id}) < (${ts}::timestamptz, ${id}::uuid)`;

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
   * The audit lines of ONE organization, newest first, with a cursor (`ts` and `id` of the last line seen, exact to the microsecond; the id breaks the ties, so no line is skipped or shown twice).
   * Each row comes with its `ts` for the cursor of the next page.
   */
  async listForOrganization(organizationId: string, limit: number, cursor?: { ts: string; id: string }) {
    const conditions: SQL[] = [eq(auditLogs.organizationId, organizationId)];
    if (cursor) conditions.push(auditOlderThan(cursor.ts, cursor.id));
    return this.db.select({ a: auditLogs, ts: AUDIT_TS }).from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.createdAt), desc(auditLogs.id)).limit(limit + 1);
  }
}
