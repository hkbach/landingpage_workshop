import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service";
import { autoCloseEnded } from "../catalog/session-sweeper";
import { ScheduleService } from "../catalog/schedule.service";
import { DB, type Database } from "../db/db.module";

export const SESSIONS_SWEEP_QUEUE = "sessions.sweep";
export const SESSIONS_GENERATE_QUEUE = "sessions.generate";

/**
 * The scheduled work of the worker besides the outbox: close the sessions whose time is over (every minute, for every shop: a screen of a shop also does it for itself when it asks)
 * and make the sessions of the weekly schedules (every hour: the rule is applied in the time zone of each shop, and running it more often than once a day costs nothing because it is
 * idempotent, REQUIREMENTS FR-SCHED-01).
 */
@Injectable()
export class MaintenanceService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ScheduleService) private readonly schedule: ScheduleService,
  ) {}

  /** Closes every session of every shop whose end has passed. Returns how many. */
  sweepSessions(now = new Date()): Promise<number> {
    return autoCloseEnded(this.db, this.audit, { now });
  }

  generateSessions(now = new Date()): Promise<{ shops: number; created: number }> {
    return this.schedule.generateAll(now);
  }
}
