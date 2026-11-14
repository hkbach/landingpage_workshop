import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database } from "../db/db.module";
import { contactMessages, organizationMembers, outboxEvents, users } from "../db/schema";
import { OutboxService } from "../outbox/outbox.service";
import { readPlatformValues } from "./platform.service";
import { olderThan, readKeyset, tsOf, writeKeyset } from "../common/keyset";

/** An administrator may write to at most this many people at once (FR-ADM-22). */
export const MAX_RECIPIENTS = 500;

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const statusOf = (s: string): "SENT" | "FAILED" | "PENDING" => (s === "DISPATCHED" ? "SENT" : s === "FAILED" ? "FAILED" : "PENDING");

export type Audience = "ADDRESS" | "SHOP_OWNERS" | "CUSTOMERS";

/**
 * The system emails (FR-ADM-22): the list of what was sent or tried (who, when, which kind, the result, never the content: it can hold a secret link or a code), a new try for one that failed,
 * and the notices the administrator writes (operational notices only: no marketing, D16). The content of an email an administrator wrote is the only one that can be read again.
 */
@Injectable()
export class EmailsService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(OutboxService) private readonly outbox: OutboxService) {}

  /** `GET /admin/directory/emails`: newest first. Search: address, subject, kind; filter: kind, state (`SENT`, `FAILED`, `PENDING`). */
  async list(q: { q?: string | undefined; type?: string | undefined; status?: "SENT" | "FAILED" | "PENDING" | undefined; limit: number; cursor?: string | undefined }) {
    const like = q.q ? `%${escapeLike(q.q)}%` : undefined;
    const dbStatus = q.status === "SENT" ? "DISPATCHED" : q.status === "FAILED" ? "FAILED" : q.status === "PENDING" ? "PENDING" : undefined;
    const conditions: (SQL | undefined)[] = [
      eq(outboxEvents.type, "EMAIL"), isNotNull(outboxEvents.template), q.type ? eq(outboxEvents.template, q.type) : undefined, dbStatus ? eq(outboxEvents.status, dbStatus) : undefined,
      like ? sql`(${outboxEvents.recipient} ilike ${like} escape '\\' or ${outboxEvents.subject} ilike ${like} escape '\\' or ${outboxEvents.template} ilike ${like} escape '\\')` : undefined,
    ];
    const after = readKeyset(q.cursor);
    if (after) conditions.push(olderThan(outboxEvents.createdAt, outboxEvents.id, after));
    const rows = await this.db.select({ e: outboxEvents, ts: tsOf(outboxEvents.createdAt) }).from(outboxEvents).where(and(...conditions)).orderBy(desc(outboxEvents.createdAt), desc(outboxEvents.id)).limit(q.limit + 1);
    return {
      items: rows.slice(0, q.limit).map(({ e }) => ({ id: e.id, createdAt: e.createdAt.toISOString(), to: e.recipient, subject: e.subject, type: e.template, status: statusOf(e.status), attempts: e.attempts, lastError: e.lastError })),
      nextCursor: rows.length > q.limit ? writeKeyset(rows[q.limit - 1]!.ts, rows[q.limit - 1]!.e.id) : null,
    };
  }

  /** `GET /admin/emails/{id}`: who, when, the result; the content only when an administrator wrote it. */
  async get(id: string) {
    const [e] = await this.db.select().from(outboxEvents).where(and(eq(outboxEvents.id, id), eq(outboxEvents.type, "EMAIL"), isNotNull(outboxEvents.template))).limit(1);
    if (!e) throw new NotFoundException({ code: "NOT_FOUND", message: "Email not found." });
    const written = e.template === "admin-message" ? (e.payload as { template?: { data?: { subject?: string; body?: string } } }).template?.data : undefined;
    return {
      id: e.id, createdAt: e.createdAt.toISOString(), to: e.recipient, subject: e.subject, type: e.template, status: statusOf(e.status), attempts: e.attempts, lastError: e.lastError,
      content: written ? { subject: written.subject ?? "", body: written.body ?? "" } : null,
    };
  }

  /** `POST /admin/emails/{id}/resend`: a new try for an email that failed (`409 NOT_FAILED` for any other). */
  async resend(id: string, actor: Actor) {
    await this.db.transaction(async (tx) => {
      const [e] = await tx.select().from(outboxEvents).where(and(eq(outboxEvents.id, id), eq(outboxEvents.type, "EMAIL"), isNotNull(outboxEvents.template))).limit(1).for("update");
      if (!e) throw new NotFoundException({ code: "NOT_FOUND", message: "Email not found." });
      if (e.status !== "FAILED") throw new ConflictException({ code: "NOT_FAILED", message: "Only an email that failed can be sent again." });
      await tx.update(outboxEvents).set({ status: "PENDING", attempts: 0, lastError: null, availableAt: sql`now()` }).where(eq(outboxEvents.id, id));
      await this.audit.record({ actorUserId: actor.userId, action: "email.resend", entityType: "email", entityId: id, after: { type: e.template }, ip: actor.ip }, tx);
    });
    void this.outbox.wake();
    return { id, status: "PENDING" as const };
  }

  /**
   * `POST /admin/emails`: one email to one address, or one separate email to every shop owner or every customer with an account that is active (nobody sees the address of anybody else; at most 500).
   * Plain text. Audited with who it was for, how many and the subject, never the content.
   */
  async compose(input: { audience: Audience; address?: string | undefined; subject: string; body: string }, actor: Actor) {
    let to: { email: string; name: string; locale?: string }[];
    if (input.audience === "ADDRESS") {
      if (!input.address) throw new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields: { address: "required" } } });
      to = [{ email: input.address, name: "" }];
    } else {
      const owners = this.db.select({ id: organizationMembers.userId }).from(organizationMembers);
      const base = [eq(users.status, "ACTIVE"), isNull(users.platformRole)];
      const rows = await this.db.select({ email: users.email, name: users.fullName, locale: users.uiLocale }).from(users).where(and(...base, input.audience === "SHOP_OWNERS" ? inArray(users.id, owners) : sql`${users.id} not in (select user_id from organization_members)`)).limit(MAX_RECIPIENTS + 1);
      if (rows.length > MAX_RECIPIENTS) throw new UnprocessableEntityException({ code: "VALIDATION", message: `A notice goes to at most ${MAX_RECIPIENTS} people at once.`, details: { fields: { audience: "tooMany" } } });
      if (rows.length === 0) throw new UnprocessableEntityException({ code: "VALIDATION", message: "Nobody to send it to.", details: { fields: { audience: "noRecipients" } } });
      to = rows;
    }
    await this.db.transaction(async (tx) => {
      for (const r of to) await this.outbox.enqueueEmail(tx, { name: "admin-message", to: r.email, ...(r.locale ? { locale: r.locale } : {}), data: { ...(r.name ? { name: r.name } : {}), subject: input.subject, body: input.body } });
      await this.audit.record({ actorUserId: actor.userId, action: "email.send", entityType: "email", entityId: input.audience, after: { audience: input.audience, recipients: to.length, subject: input.subject }, ip: actor.ip }, tx);
    });
    void this.outbox.wake();
    return { queued: to.length };
  }

  /**
   * What is kept for a time only (D18): the emails sent and the Contact messages, for as long as the administrator set in the platform settings (defaults: 90 days and 12 months).
   * Returns how many of each were removed.
   */
  async purgeExpired(now = new Date()): Promise<{ emails: number; messages: number }> {
    const keep = await readPlatformValues(this.db);
    const emailCut = new Date(now.getTime() - keep.emailRetentionDays * 86_400_000);
    const messageCut = new Date(now); messageCut.setMonth(messageCut.getMonth() - keep.contactRetentionMonths);
    const emails = await this.db.delete(outboxEvents).where(and(eq(outboxEvents.type, "EMAIL"), inArray(outboxEvents.status, ["DISPATCHED", "FAILED"]), lt(outboxEvents.createdAt, emailCut))).returning({ id: outboxEvents.id });
    const messages = await this.db.delete(contactMessages).where(lt(contactMessages.createdAt, messageCut)).returning({ id: contactMessages.id });
    return { emails: emails.length, messages: messages.length };
  }
}
