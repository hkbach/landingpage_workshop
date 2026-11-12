import { and, eq, lte, notInArray, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import type { Executor } from "../db/db.module";
import { workshopSessions } from "../db/schema";

/**
 * The system closes a session once its time is over (REQUIREMENTS FR-SCHED-02): every session that is not CLOSED or COMPLETED and whose end has passed becomes CLOSED with
 * `auto_closed` set and an AUTO_CLOSED note at the time it ended. One UPDATE, so it is safe to run twice or from two places at once. The worker runs it every minute for every shop; a
 * request of a shop runs it for that shop first, so a screen never shows a session that ended as still open.
 */
export async function autoCloseEnded(executor: Executor, audit: AuditService, options: { organizationId?: string; now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const closed = await executor
    .update(workshopSessions)
    .set({
      status: "CLOSED", autoClosed: true, updatedAt: now,
      sessionNotes: sql`${workshopSessions.sessionNotes} || jsonb_build_array(jsonb_build_object('type', 'AUTO_CLOSED', 'at', to_char(${workshopSessions.endsAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')))`,
    })
    .where(and(notInArray(workshopSessions.status, ["CLOSED", "COMPLETED"]), lte(workshopSessions.endsAt, now), options.organizationId ? eq(workshopSessions.organizationId, options.organizationId) : undefined))
    .returning({ id: workshopSessions.id, organizationId: workshopSessions.organizationId, code: workshopSessions.code });
  for (const s of closed) await audit.record({ organizationId: s.organizationId, action: "session.auto_close", entityType: "session", entityId: s.id, after: { code: s.code } }, executor);
  return closed.length;
}
