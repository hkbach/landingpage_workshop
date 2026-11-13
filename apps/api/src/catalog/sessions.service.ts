import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, eq, gt, gte, lte, or, sql, type SQL } from "drizzle-orm";
import {
  applySessionAction, type SessionCloseReason, canCloseAgain, canCompleteSession, canEditSession, canReopenSession, checkCloseReason, checkCloseReasonFor, checkReschedule, checkRescheduleReason, closeCount, isFinalClose, isFutureStart,
  rescheduleCount, type SessionNote, type SessionStatus,
} from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import { isUniqueViolation } from "../auth/auth.service";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database, type Executor } from "../db/db.module";
import { organizations, workshopSessions, workshops, type SessionNoteRow } from "../db/schema";
import { OutboxService } from "../outbox/outbox.service";
import { assertShopWritable } from "../tenant/shop-writable";
import { tenantScope } from "../tenant/tenant-scope";
import type { Actor } from "./workshops.service";
import { notifyGuests } from "./session-notices";
import { autoCloseEnded } from "./session-sweeper";

type SessionRow = typeof workshopSessions.$inferSelect;

/** What the API shows of a session: the names of the web app's `Session`, plus the workshop and the counters of its history. */
export interface SessionView {
  id: string; code: string; workshopId: string; workshopTitle: Record<string, string>; startsAt: string; endsAt: string; capacity: number; reservedCount: number; status: SessionStatus;
  autoClosed: boolean; bookingCutoffMinutes: number; imageUrl: string | null; scheduleRuleId: string | null; notes: SessionNoteRow[]; reschedules: number; closes: number;
}

const toView = (s: SessionRow, workshopTitle: Record<string, string>): SessionView => ({
  id: s.id, code: s.code, workshopId: s.workshopId, workshopTitle, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), capacity: s.capacity, reservedCount: s.reservedCount, status: s.status,
  autoClosed: s.autoClosed, bookingCutoffMinutes: s.bookingCutoffMinutes, imageUrl: s.imageUrl, scheduleRuleId: s.scheduleRuleId, notes: s.sessionNotes,
  reschedules: rescheduleCount(s.sessionNotes as SessionNote[]), closes: closeCount(s.sessionNotes as SessionNote[]),
});

const bad = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Session not found." }); // the same answer for an id that does not exist and one of another shop
const conflict = (code: string, message: string, details: Record<string, unknown> = {}) => new ConflictException({ code, message, details });

/** The next code of a shop ("SES-0007"): one atomic UPDATE, so two sessions made at once never share a code. */
export async function nextSessionCode(executor: Executor, organizationId: string): Promise<string> {
  const [row] = await executor.update(organizations).set({ sessionSeq: sql`${organizations.sessionSeq} + 1` }).where(eq(organizations.id, organizationId)).returning({ n: organizations.sessionSeq });
  if (!row) throw notFound();
  return `SES-${String(row.n).padStart(4, "0")}`;
}

@Injectable()
export class SessionsService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(OutboxService) private readonly outbox: OutboxService) {}

  private async load(executor: Executor, org: OrgContext, id: string, lock = false): Promise<{ session: SessionRow; workshopTitle: Record<string, string>; duration: number }> {
    const query = executor
      .select({ session: workshopSessions, title: workshops.title, duration: workshops.durationMinutes })
      .from(workshopSessions)
      .innerJoin(workshops, and(eq(workshops.organizationId, workshopSessions.organizationId), eq(workshops.id, workshopSessions.workshopId)))
      .where(and(tenantScope(workshopSessions, org.id), eq(workshopSessions.id, id)))
      .limit(1);
    const [row] = lock ? await query.for("update", { of: workshopSessions }) : await query;
    if (!row) throw notFound();
    return { session: row.session, workshopTitle: row.title, duration: row.duration };
  }

  async create(org: OrgContext, input: { workshopId: string; startsAt: string; capacity?: number | undefined; bookingCutoffMinutes?: number | undefined; imageUrl?: string | undefined }, actor: Actor, now = new Date()): Promise<SessionView> {
    assertShopWritable(org);
    if (!isFutureStart(input.startsAt, now)) throw bad({ startsAt: "past" });
    try {
      return await this.db.transaction(async (tx) => {
        const [w] = await tx.select().from(workshops).where(and(tenantScope(workshops, org.id), eq(workshops.id, input.workshopId))).limit(1);
        if (!w) throw bad({ workshopId: "unknown" }); // a workshop of another shop looks like one that does not exist
        const capacity = input.capacity ?? w.defaultCapacity;
        const starts = new Date(input.startsAt);
        const code = await nextSessionCode(tx, org.id);
        const [row] = await tx.insert(workshopSessions).values({
          organizationId: org.id, workshopId: w.id, startsAt: starts, originStartsAt: starts, endsAt: new Date(starts.getTime() + w.durationMinutes * 60_000), capacity, code,
          ...(input.bookingCutoffMinutes !== undefined ? { bookingCutoffMinutes: input.bookingCutoffMinutes } : {}), ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        }).returning();
        if (!row) throw new Error("The session was not created");
        await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "session.create", entityType: "session", entityId: row.id, after: { code, workshopId: w.id, startsAt: row.startsAt.toISOString(), capacity }, ip: actor.ip }, tx);
        return toView(row, w.title);
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("DUPLICATE", "This workshop already has a session at that time.");
      throw error;
    }
  }

  async list(org: OrgContext, query: { workshopId?: string | undefined; status?: SessionStatus | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    await autoCloseEnded(this.db, this.audit, { organizationId: org.id });
    const conditions: (SQL | undefined)[] = [tenantScope(workshopSessions, org.id)];
    if (query.workshopId) conditions.push(eq(workshopSessions.workshopId, query.workshopId));
    if (query.status) conditions.push(eq(workshopSessions.status, query.status));
    if (query.from) conditions.push(gte(workshopSessions.startsAt, new Date(query.from)));
    if (query.to) conditions.push(lte(workshopSessions.startsAt, new Date(query.to)));
    if (query.cursor) {
      const c = decodeCursor<{ t: string; id: string }>(query.cursor, ["t", "id"]);
      const at = new Date(String(c.t));
      if (Number.isNaN(at.getTime())) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
      conditions.push(or(gt(workshopSessions.startsAt, at), and(eq(workshopSessions.startsAt, at), gt(workshopSessions.id, String(c.id)))));
    }
    const rows = await this.db
      .select({ session: workshopSessions, title: workshops.title })
      .from(workshopSessions)
      .innerJoin(workshops, and(eq(workshops.organizationId, workshopSessions.organizationId), eq(workshops.id, workshopSessions.workshopId)))
      .where(and(...conditions)).orderBy(asc(workshopSessions.startsAt), asc(workshopSessions.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = rows.length > query.limit ? page[page.length - 1] : undefined;
    return { items: page.map((r) => toView(r.session, r.title)), nextCursor: last ? encodeCursor({ t: last.session.startsAt.toISOString(), id: last.session.id }) : null };
  }

  async get(org: OrgContext, id: string): Promise<SessionView> {
    await autoCloseEnded(this.db, this.audit, { organizationId: org.id });
    const { session, workshopTitle } = await this.load(this.db, org, id);
    return toView(session, workshopTitle);
  }

  /** Capacity, booking cut-off and picture of a session that is Open or Paused. The capacity can never go below what is already reserved. */
  async update(org: OrgContext, id: string, input: { capacity?: number | undefined; bookingCutoffMinutes?: number | undefined; imageUrl?: string | undefined }, actor: Actor): Promise<SessionView> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      await autoCloseEnded(tx, this.audit, { organizationId: org.id });
      const { session, workshopTitle } = await this.load(tx, org, id, true);
      if (!canEditSession(session.status)) throw conflict("NOT_EDITABLE", "Only an Open or Paused session can be edited.");
      if (input.capacity !== undefined && input.capacity < session.reservedCount) throw bad({ capacity: "belowReserved" });
      const [row] = await tx.update(workshopSessions).set({
        updatedAt: new Date(),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.bookingCutoffMinutes !== undefined ? { bookingCutoffMinutes: input.bookingCutoffMinutes } : {}),
        ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl === "" ? null : input.imageUrl } : {}),
      }).where(and(tenantScope(workshopSessions, org.id), eq(workshopSessions.id, id))).returning();
      if (!row) throw notFound();
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "session.update", entityType: "session", entityId: id, before: { capacity: session.capacity, bookingCutoffMinutes: session.bookingCutoffMinutes }, after: { capacity: row.capacity, bookingCutoffMinutes: row.bookingCutoffMinutes }, ip: actor.ip }, tx);
      return toView(row, workshopTitle);
    });
  }

  /** Start (Open or Paused -> Running) and Pause (Running -> Paused). */
  async act(org: OrgContext, id: string, action: "start" | "pause", actor: Actor): Promise<SessionView> {
    assertShopWritable(org);
    return this.transition(org, id, actor, `session.${action}`, (s) => {
      const next = applySessionAction({ status: s.status }, action);
      if (!next) throw conflict("INVALID_STATE", `A ${s.status.toLowerCase()} session cannot be ${action === "start" ? "started" : "paused"}.`);
      return { set: { status: next.status } };
    });
  }

  /** Close (a Paused session) with a reason that fits the time; the 4th close is for good, and a re-open is only possible before the session starts. */
  async close(org: OrgContext, id: string, reason: { code: string; note?: string | undefined }, actor: Actor, now = new Date(), opts: { admin?: boolean } = {}): Promise<SessionView> {
    assertShopWritable(org);
    return this.transition(org, id, actor, "session.close", (s) => {
      // The owner closes a PAUSED session, at most 4 times. A platform administrator may close an open, paused or running session (not one that is over), without that limit (FR-ADM-13).
      if (opts.admin ? !["OPEN", "PAUSED", "RUNNING"].includes(s.status) : applySessionAction({ status: s.status }, "close") === null) throw conflict("INVALID_STATE", opts.admin ? "Only an open, paused or running session can be closed." : "Only a paused session can be closed.");
      const notes = s.sessionNotes as SessionNote[];
      if (!opts.admin && !canCloseAgain(notes)) throw conflict("CLOSE_LIMIT", "This session cannot be closed again.");
      const checked = opts.admin ? checkCloseReason(reason.code, reason.note ?? "") : checkCloseReasonFor({ startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString() }, now, reason.code, reason.note ?? "");
      if (!checked.ok) throw bad({ reason: checked.error === "NOTE_REQUIRED" ? "noteRequired" : checked.error === "NOTE_TOO_LONG" ? "tooLong" : "required" });
      return { set: { status: "CLOSED" as const }, note: { type: "CLOSED", at: now.toISOString(), reason: checked.reason }, details: { reason: checked.reason.code, forGood: isFinalClose(notes) } };
    });
  }

  async reopen(org: OrgContext, id: string, actor: Actor, now = new Date(), opts: { admin?: boolean } = {}): Promise<SessionView> {
    assertShopWritable(org);
    return this.transition(org, id, actor, "session.reopen", (s) => {
      // The owner cannot re-open a session closed for good (4 closes); the platform administrator can (FR-ADM-13). Neither can re-open one the system closed, one that has started or one that is completed.
      const notes = opts.admin ? [] : (s.sessionNotes as SessionNote[]);
      if (!canReopenSession({ status: s.status, startsAt: s.startsAt.toISOString(), autoClosed: s.autoClosed, notes }, now)) throw conflict("NOT_REOPENABLE", "This session cannot be re-opened.");
      return { set: { status: "OPEN" as const }, note: { type: "REOPENED", at: now.toISOString() } };
    });
  }

  /** Completed is final: any Closed session can be confirmed as done (after the payments are checked). */
  async complete(org: OrgContext, id: string, actor: Actor): Promise<SessionView> {
    assertShopWritable(org);
    return this.transition(org, id, actor, "session.complete", (s) => {
      if (!canCompleteSession({ status: s.status })) throw conflict("INVALID_STATE", "Only a closed session can be completed.");
      return { set: { status: "COMPLETED" as const } };
    });
  }

  /** Moves an Open or Paused session to another start (its length stays): at most 3 times, to the future, never onto another session of the workshop. */
  async reschedule(org: OrgContext, id: string, input: { newStartsAt: string; reason: { code: string; note?: string | undefined } }, actor: Actor, now = new Date(), opts: { admin?: boolean } = {}): Promise<SessionView> {
    assertShopWritable(org);
    const reason = checkRescheduleReason(input.reason.code, input.reason.note ?? "");
    if (!reason.ok) throw bad({ reason: reason.error === "NOTE_REQUIRED" ? "noteRequired" : reason.error === "NOTE_TOO_LONG" ? "tooLong" : "required" });
    try {
      return await this.db.transaction(async (tx) => {
        await autoCloseEnded(tx, this.audit, { organizationId: org.id });
        const { session, workshopTitle } = await this.load(tx, org, id, true);
        const others = await tx.select({ startsAt: workshopSessions.startsAt }).from(workshopSessions).where(and(tenantScope(workshopSessions, org.id), eq(workshopSessions.workshopId, session.workshopId)));
        const checked = checkReschedule(
          { status: session.status, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), reschedules: opts.admin ? 0 : rescheduleCount(session.sessionNotes as SessionNote[]) }, // the limit of 3 is the owner's
          input.newStartsAt, now, others.filter((o) => o.startsAt.getTime() !== session.startsAt.getTime()).map((o) => o.startsAt.toISOString()),
        );
        if (!checked.ok) {
          if (checked.error === "SAME" || checked.error === "PAST") throw bad({ newStartsAt: checked.error.toLowerCase() });
          throw conflict(checked.error, "This session cannot be re-scheduled.");
        }
        const note: SessionNoteRow = { type: "RESCHEDULED", at: now.toISOString(), reason: reason.reason, from: session.startsAt.toISOString() };
        const [row] = await tx.update(workshopSessions).set({ startsAt: new Date(checked.startsAt), endsAt: new Date(checked.endsAt), sessionNotes: [...session.sessionNotes, note], updatedAt: now })
          .where(and(tenantScope(workshopSessions, org.id), eq(workshopSessions.id, id))).returning();
        if (!row) throw notFound();
        await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "session.reschedule", entityType: "session", entityId: id, before: { startsAt: session.startsAt.toISOString() }, after: { startsAt: checked.startsAt, reason: reason.reason.code }, ip: actor.ip }, tx);
        // every guest who booked the session is told, in the same transaction (outbox); the worker is woken after the commit
        const told = await notifyGuests(tx, this.outbox, { organizationId: org.id, sessionId: id, workshopTitle, startsAt: row.startsAt, endsAt: row.endsAt, previousStartsAt: session.startsAt, kind: "RESCHEDULED", reason: reason.reason });
        return { view: toView(row, workshopTitle), told };
      }).then(({ view, told }) => { if (told > 0) void this.outbox.wake(); return view; });
    } catch (error) {
      if (isUniqueViolation(error)) throw conflict("DUPLICATE", "This workshop already has a session at that time.");
      throw error;
    }
  }

  private async transition(
    org: OrgContext, id: string, actor: Actor, action: string,
    decide: (s: SessionRow) => { set: { status: SessionStatus }; note?: SessionNoteRow; details?: Record<string, unknown> },
  ): Promise<SessionView> {
    return this.db.transaction(async (tx) => {
      await autoCloseEnded(tx, this.audit, { organizationId: org.id });
      const { session, workshopTitle } = await this.load(tx, org, id, true);
      const { set, note, details } = decide(session);
      const [row] = await tx.update(workshopSessions).set({ ...set, updatedAt: new Date(), ...(note ? { sessionNotes: [...session.sessionNotes, note] } : {}) })
        .where(and(tenantScope(workshopSessions, org.id), eq(workshopSessions.id, id))).returning();
      if (!row) throw notFound();
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action, entityType: "session", entityId: id, before: { status: session.status }, after: { status: row.status, ...details }, ip: actor.ip }, tx);
      // a close tells every guest who booked the session, in the same transaction (outbox); the worker is woken after the commit
      const told = note?.type === "CLOSED" ? await notifyGuests(tx, this.outbox, { organizationId: org.id, sessionId: id, workshopTitle, startsAt: row.startsAt, endsAt: row.endsAt, kind: "CLOSED", ...(note.reason ? { reason: note.reason as SessionCloseReason } : {}) }) : 0;
      return { view: toView(row, workshopTitle), told };
    }).then(({ view, told }) => { if (told > 0) void this.outbox.wake(); return view; });
  }
}
