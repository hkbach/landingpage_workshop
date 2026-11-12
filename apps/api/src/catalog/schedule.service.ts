import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import { ruleStarts } from "../common/zoned-time";
import { DB, type Database, type Executor } from "../db/db.module";
import { organizations, scheduleRules, workshopSessions, workshops } from "../db/schema";
import { assertShopWritable } from "../tenant/shop-writable";
import { tenantScope } from "../tenant/tenant-scope";
import type { ScheduleRuleInput } from "./session.schemas";
import { nextSessionCode } from "./sessions.service";
import type { Actor } from "./workshops.service";

type RuleRow = typeof scheduleRules.$inferSelect;
export const GENERATE_DAYS = 60;
export const MAX_RULES_PER_WORKSHOP = 20;

export interface RuleView { id: string; workshopId: string; weekdays: number[]; startTimes: string[]; effectiveFrom: string; effectiveTo: string | null; capacityOverride: number | null; status: "ACTIVE" | "INACTIVE" }
const toView = (r: RuleRow): RuleView => ({ id: r.id, workshopId: r.workshopId, weekdays: r.weekdays, startTimes: r.startTimes, effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo, capacityOverride: r.capacityOverride, status: r.status });

/**
 * The weekly schedule of a workshop (FR-SCHED-01) and the generation of its sessions: every ACTIVE rule makes the sessions of the next 60 days (in the time zone of the shop), idempotently.
 * Idempotent means: a slot is made once. The unique keys of workshop_sessions (workshop + slot, workshop + start) make two runs at once safe, and a session that was re-scheduled, closed or
 * booked keeps its slot, so it is never made again.
 */
@Injectable()
export class ScheduleService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  /** Makes the missing sessions of one rule. Returns how many were made. */
  async generateForRule(executor: Executor, shop: { id: string; timezone: string }, rule: RuleRow, workshop: { durationMinutes: number; defaultCapacity: number }, now: Date): Promise<number> {
    if (rule.status !== "ACTIVE") return 0;
    const starts = ruleStarts({ weekdays: rule.weekdays, startTimes: rule.startTimes, effectiveFrom: rule.effectiveFrom, effectiveTo: rule.effectiveTo }, shop.timezone, now, GENERATE_DAYS);
    if (starts.length === 0) return 0;
    const taken = await executor
      .select({ origin: workshopSessions.originStartsAt, starts: workshopSessions.startsAt })
      .from(workshopSessions)
      .where(and(tenantScope(workshopSessions, shop.id), eq(workshopSessions.workshopId, rule.workshopId), or(inArray(workshopSessions.originStartsAt, starts), inArray(workshopSessions.startsAt, starts))));
    const used = new Set(taken.flatMap((t) => [t.origin.getTime(), t.starts.getTime()]));
    let made = 0;
    for (const at of starts) {
      if (used.has(at.getTime())) continue;
      const code = await nextSessionCode(executor, shop.id);
      const inserted = await executor.insert(workshopSessions).values({
        organizationId: shop.id, workshopId: rule.workshopId, scheduleRuleId: rule.id, startsAt: at, originStartsAt: at, endsAt: new Date(at.getTime() + workshop.durationMinutes * 60_000),
        capacity: rule.capacityOverride ?? workshop.defaultCapacity, code,
      }).onConflictDoNothing().returning({ id: workshopSessions.id });
      made += inserted.length;
    }
    return made;
  }

  /** Every ACTIVE rule of one shop (the worker runs this for all shops; a rule that was just saved runs it for itself). */
  async generateForOrganization(organizationId: string, now = new Date()): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [shop] = await tx.select({ id: organizations.id, timezone: organizations.timezone, status: organizations.status }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
      if (!shop || shop.status === "SUSPENDED") return 0; // a suspended shop makes no new sessions
      const rules = await tx
        .select({ rule: scheduleRules, durationMinutes: workshops.durationMinutes, defaultCapacity: workshops.defaultCapacity })
        .from(scheduleRules)
        .innerJoin(workshops, and(eq(workshops.organizationId, scheduleRules.organizationId), eq(workshops.id, scheduleRules.workshopId)))
        .where(and(tenantScope(scheduleRules, organizationId), eq(scheduleRules.status, "ACTIVE")));
      let made = 0;
      for (const r of rules) made += await this.generateForRule(tx, shop, r.rule, r, now);
      if (made > 0) await this.audit.record({ organizationId, action: "schedule.generate", entityType: "organization", entityId: organizationId, after: { created: made } }, tx);
      return made;
    });
  }

  /** The job of the worker: every shop that has an ACTIVE rule. */
  async generateAll(now = new Date()): Promise<{ shops: number; created: number }> {
    const rows = await this.db.selectDistinct({ id: scheduleRules.organizationId }).from(scheduleRules).where(eq(scheduleRules.status, "ACTIVE"));
    let created = 0;
    for (const r of rows) created += await this.generateForOrganization(r.id, now);
    return { shops: rows.length, created };
  }

  // ---- the rules of a workshop (the shop owner) ------------------------------------------------------------------------------------------------------------------

  private async workshop(executor: Executor, org: OrgContext, workshopId: string) {
    const [w] = await executor.select({ id: workshops.id, durationMinutes: workshops.durationMinutes, defaultCapacity: workshops.defaultCapacity }).from(workshops).where(and(tenantScope(workshops, org.id), eq(workshops.id, workshopId))).limit(1);
    if (!w) throw new NotFoundException({ code: "NOT_FOUND", message: "Workshop not found." });
    return w;
  }

  private async rule(executor: Executor, org: OrgContext, id: string, lock = false): Promise<RuleRow> {
    const query = executor.select().from(scheduleRules).where(and(tenantScope(scheduleRules, org.id), eq(scheduleRules.id, id))).limit(1);
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Schedule rule not found." });
    return row;
  }

  private async timezone(executor: Executor, org: OrgContext): Promise<string> {
    const [row] = await executor.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, org.id)).limit(1);
    return row?.timezone ?? "UTC";
  }

  /** A change of a rule (FR-SCHED-01): the future sessions it made that nobody booked and nobody touched are deleted, then made again from the new rule. A session with a booking, a note or another status stays. */
  private async clearUntouched(executor: Executor, org: OrgContext, ruleId: string, now: Date): Promise<number> {
    const removed = await executor.delete(workshopSessions).where(and(
      tenantScope(workshopSessions, org.id), eq(workshopSessions.scheduleRuleId, ruleId), eq(workshopSessions.status, "OPEN"), eq(workshopSessions.reservedCount, 0),
      sql`${workshopSessions.startsAt} > ${now.toISOString()}::timestamptz`, sql`jsonb_array_length(${workshopSessions.sessionNotes}) = 0`,
    )).returning({ id: workshopSessions.id });
    return removed.length;
  }

  async list(org: OrgContext, workshopId: string): Promise<RuleView[]> {
    await this.workshop(this.db, org, workshopId);
    const rows = await this.db.select().from(scheduleRules).where(and(tenantScope(scheduleRules, org.id), eq(scheduleRules.workshopId, workshopId))).orderBy(asc(scheduleRules.createdAt), asc(scheduleRules.id));
    return rows.map(toView);
  }

  async create(org: OrgContext, workshopId: string, input: ScheduleRuleInput, actor: Actor, now = new Date()): Promise<{ rule: RuleView; sessionsCreated: number }> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      const w = await this.workshop(tx, org, workshopId);
      const existing = await tx.select({ id: scheduleRules.id }).from(scheduleRules).where(and(tenantScope(scheduleRules, org.id), eq(scheduleRules.workshopId, workshopId)));
      if (existing.length >= MAX_RULES_PER_WORKSHOP) throw new ConflictException({ code: "RULE_LIMIT", message: "This workshop has too many schedule rules." });
      const [row] = await tx.insert(scheduleRules).values({ ...input, organizationId: org.id, workshopId }).returning();
      if (!row) throw new Error("The rule was not created");
      const sessionsCreated = await this.generateForRule(tx, { id: org.id, timezone: await this.timezone(tx, org) }, row, w, now);
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "schedule_rule.create", entityType: "schedule_rule", entityId: row.id, after: { workshopId, ...input, sessionsCreated }, ip: actor.ip }, tx);
      return { rule: toView(row), sessionsCreated };
    });
  }

  async update(org: OrgContext, id: string, input: ScheduleRuleInput, actor: Actor, now = new Date()): Promise<{ rule: RuleView; sessionsDeleted: number; sessionsCreated: number }> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      const before = await this.rule(tx, org, id, true);
      const w = await this.workshop(tx, org, before.workshopId);
      const [row] = await tx.update(scheduleRules).set({ ...input, updatedAt: now }).where(and(tenantScope(scheduleRules, org.id), eq(scheduleRules.id, id))).returning();
      if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Schedule rule not found." });
      const sessionsDeleted = await this.clearUntouched(tx, org, id, now);
      const sessionsCreated = await this.generateForRule(tx, { id: org.id, timezone: await this.timezone(tx, org) }, row, w, now);
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "schedule_rule.update", entityType: "schedule_rule", entityId: id, before: toView(before), after: { ...toView(row), sessionsDeleted, sessionsCreated }, ip: actor.ip }, tx);
      return { rule: toView(row), sessionsDeleted, sessionsCreated };
    });
  }

  async remove(org: OrgContext, id: string, actor: Actor, now = new Date()): Promise<{ sessionsDeleted: number }> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      const before = await this.rule(tx, org, id, true);
      const sessionsDeleted = await this.clearUntouched(tx, org, id, now);
      await tx.delete(scheduleRules).where(and(tenantScope(scheduleRules, org.id), eq(scheduleRules.id, id))); // the sessions left keep their data and lose the link (ON DELETE SET NULL)
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "schedule_rule.delete", entityType: "schedule_rule", entityId: id, before: toView(before), after: { sessionsDeleted }, ip: actor.ip }, tx);
      return { sessionsDeleted };
    });
  }
}
