import { randomUUID } from "node:crypto";
import { ConflictException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { REPORT_DESCRIPTION_MAX, REPORT_NOTE_MAX, countReports, type ReportRecord } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import { TurnstileService } from "../auth/turnstile.service";
import type { Actor } from "../catalog/workshops.service";
import { RateLimiter } from "../common/limiter";
import { DB, type Database } from "../db/db.module";
import { contactMessages, organizations, siteReports, users } from "../db/schema";
import { OutboxService } from "../outbox/outbox.service";
import { readPlatformValues } from "./platform.service";
import { olderThan, readKeyset, tsOf, writeKeyset } from "../common/keyset";

export const CONTACT_TOPICS = ["general", "demo", "support", "partnership"] as const;
export const MESSAGE_STATUSES = ["NEW", "IN_PROGRESS", "DONE"] as const;
type MessageStatus = (typeof MESSAGE_STATUSES)[number];

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const notFound = (what: string) => new NotFoundException({ code: "NOT_FOUND", message: `${what} not found.` });
const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
const throttled = (seconds: number) => new HttpException({ code: "RATE_LIMITED", message: "Too many attempts. Please try again later.", details: { retryAfterSeconds: seconds } }, 429);

/**
 * What visitors of the public site send to the platform and what the administrator does with it: the messages of the Contact form (FR-ADM-21) and the reports of a landing page (FR-ADM-04). The
 * text of a message and of a note is personal data: it is shown only to the administrator and is never written to the audit log.
 */
@Injectable()
export class InboxService {
  private contactLimiter = new RateLimiter(5, 3_600_000);
  private contactMax = 5;
  private readonly reportLimiter = new RateLimiter(5, 3_600_000);

  constructor(
    @Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(TurnstileService) private readonly turnstile: TurnstileService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
  ) {}

  // ---- the Contact form (public) ---------------------------------------------------------------------------------------------------------------------------------

  /**
   * `POST /public/contact`: keeps a message. A message with the hidden `website` field filled in is from a robot: it is answered 201 and thrown away. A client may send as many a hour as the
   * administrator allows (default 5, FR-ADM-20); only a message that was kept counts.
   */
  async submit(input: { name: string; email: string; topic: string; message: string; website?: string | undefined; turnstileToken?: string | undefined }, ip: string | null): Promise<{ id: string }> {
    const max = (await readPlatformValues(this.db)).contactPerHour;
    if (max !== this.contactMax) { this.contactLimiter = new RateLimiter(max, 3_600_000); this.contactMax = max; } // the administrator changed the limit
    const key = ip ?? "unknown";
    const wait = this.contactLimiter.retryAfter(key);
    if (wait > 0) throw throttled(wait);
    if (input.website) return { id: randomUUID() }; // a robot: told it worked, nothing kept
    if (!(await this.turnstile.verify(input.turnstileToken, ip))) throw new HttpException({ code: "BOT_CHECK_FAILED", message: "We could not check that you are a person. Please try again." }, 400);
    const [row] = await this.db.insert(contactMessages).values({ name: input.name, email: input.email.toLowerCase(), topic: input.topic, message: input.message }).returning({ id: contactMessages.id });
    this.contactLimiter.hit(key);
    await this.audit.record({ action: "contact.submit", entityType: "contact_message", entityId: row!.id, after: { topic: input.topic }, ip }); // only that a message came, and its topic
    return { id: row!.id };
  }

  // ---- the support inbox (administrator) --------------------------------------------------------------------------------------------------------------------------

  async messages(q: { q?: string | undefined; status?: MessageStatus | undefined; topic?: string | undefined; limit: number; cursor?: string | undefined }) {
    const like = q.q ? `%${escapeLike(q.q)}%` : undefined;
    const conditions: (SQL | undefined)[] = [
      q.status ? eq(contactMessages.status, q.status) : undefined, q.topic ? eq(contactMessages.topic, q.topic) : undefined,
      like ? sql`(${contactMessages.name} ilike ${like} escape '\\' or ${contactMessages.email} ilike ${like} escape '\\' or ${contactMessages.topic} ilike ${like} escape '\\' or ${contactMessages.message} ilike ${like} escape '\\')` : undefined,
    ];
    const after = readKeyset(q.cursor);
    if (after) conditions.push(olderThan(contactMessages.createdAt, contactMessages.id, after));
    const rows = await this.db.select({ m: contactMessages, ts: tsOf(contactMessages.createdAt) }).from(contactMessages).where(and(...conditions)).orderBy(desc(contactMessages.createdAt), desc(contactMessages.id)).limit(q.limit + 1);
    const counts = await this.db.select({ status: contactMessages.status, n: sql<number>`count(*)::int` }).from(contactMessages).groupBy(contactMessages.status);
    return {
      items: rows.slice(0, q.limit).map(({ m }) => ({ id: m.id, name: m.name, email: m.email, topic: m.topic, message: m.message, status: m.status, note: m.note, createdAt: m.createdAt.toISOString() })),
      nextCursor: rows.length > q.limit ? writeKeyset(rows[q.limit - 1]!.ts, rows[q.limit - 1]!.m.id) : null,
      counts: { NEW: counts.find((c) => c.status === "NEW")?.n ?? 0, IN_PROGRESS: counts.find((c) => c.status === "IN_PROGRESS")?.n ?? 0, DONE: counts.find((c) => c.status === "DONE")?.n ?? 0 },
    };
  }

  /** `PATCH /admin/messages/{id} {status?, note?}`: the state, and an internal note (up to 2000 characters, only for the administrators). Audited without the text. */
  async updateMessage(id: string, input: { status?: MessageStatus | undefined; note?: string | undefined }, actor: Actor) {
    if (input.note !== undefined && input.note.length > 2000) throw invalid({ note: "tooLong" });
    return this.db.transaction(async (tx) => {
      const [m] = await tx.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1).for("update");
      if (!m) throw notFound("Message");
      const patch: Partial<typeof contactMessages.$inferInsert> = { updatedAt: new Date() };
      if (input.status && input.status !== m.status) {
        patch.status = input.status;
        await this.audit.record({ actorUserId: actor.userId, action: "message.set_status", entityType: "contact_message", entityId: id, before: { status: m.status }, after: { status: input.status }, ip: actor.ip }, tx);
      }
      if (input.note !== undefined && input.note !== m.note) {
        patch.note = input.note;
        await this.audit.record({ actorUserId: actor.userId, action: "message.set_note", entityType: "contact_message", entityId: id, ip: actor.ip }, tx); // never the note
      }
      const [row] = await tx.update(contactMessages).set(patch).where(eq(contactMessages.id, id)).returning();
      return { id, status: row!.status, note: row!.note };
    });
  }

  /** `POST /admin/messages/{id}/reply {subject?, body}`: answers by email through the system emails and marks the message DONE. The note is never part of the answer. */
  async reply(id: string, input: { subject?: string | undefined; body: string }, actor: Actor) {
    await this.db.transaction(async (tx) => {
      const [m] = await tx.select().from(contactMessages).where(eq(contactMessages.id, id)).limit(1).for("update");
      if (!m) throw notFound("Message");
      await this.outbox.enqueueEmail(tx, { name: "admin-message", to: m.email, data: { name: m.name, subject: input.subject || "Re: your message", body: input.body } });
      await tx.update(contactMessages).set({ status: "DONE", updatedAt: new Date() }).where(eq(contactMessages.id, id));
      await this.audit.record({ actorUserId: actor.userId, action: "message.reply", entityType: "contact_message", entityId: id, ip: actor.ip }, tx);
    });
    void this.outbox.wake();
    return { id, status: "DONE" as const };
  }

  /** `DELETE /admin/messages/{id}`: removes the message for good (personal data; on the request of the sender). */
  async deleteMessage(id: string, actor: Actor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const removed = await tx.delete(contactMessages).where(eq(contactMessages.id, id)).returning({ id: contactMessages.id });
      if (removed.length === 0) throw notFound("Message");
      await this.audit.record({ actorUserId: actor.userId, action: "message.delete", entityType: "contact_message", entityId: id, ip: actor.ip }, tx);
    });
  }

  // ---- reports of a site -----------------------------------------------------------------------------------------------------------------------------------------

  /** `POST /public/sites/{slug}/reports`: 5 reports an hour from one client; a shop that does not exist or is not ACTIVE is a 404. */
  async report(slug: string, input: { reason: string; description: string; email?: string | undefined; turnstileToken?: string | undefined }, ip: string | null): Promise<{ id: string }> {
    const [shop] = await this.db.select({ id: organizations.id, status: organizations.status }).from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!shop || shop.status !== "ACTIVE") throw notFound("Site");
    const key = ip ?? "unknown";
    const wait = this.reportLimiter.retryAfter(key);
    if (wait > 0) throw throttled(wait);
    if (!(await this.turnstile.verify(input.turnstileToken, ip))) throw new HttpException({ code: "BOT_CHECK_FAILED", message: "We could not check that you are a person. Please try again." }, 400);
    const [row] = await this.db.insert(siteReports).values({ organizationId: shop.id, reason: input.reason, description: input.description.slice(0, REPORT_DESCRIPTION_MAX), reporterEmail: input.email ? input.email.toLowerCase() : null }).returning({ id: siteReports.id });
    this.reportLimiter.hit(key);
    await this.audit.record({ organizationId: shop.id, action: "report.submit", entityType: "site_report", entityId: row!.id, after: { reason: input.reason }, ip }); // not the description
    return { id: row!.id };
  }

  private async reportRows() {
    const rows = await this.db.select({ r: siteReports, slug: organizations.slug, handler: users.email }).from(siteReports).innerJoin(organizations, eq(organizations.id, siteReports.organizationId)).leftJoin(users, eq(users.id, siteReports.handledBy));
    return rows.map(({ r, slug, handler }): ReportRecord => ({
      id: r.id, shopSlug: slug, reason: r.reason as ReportRecord["reason"], description: r.description, ...(r.reporterEmail ? { reporterEmail: r.reporterEmail } : {}), status: r.status, createdAt: r.createdAt.toISOString(),
      ...(r.handledAt ? { handledAt: r.handledAt.toISOString() } : {}), ...(handler ? { handledBy: handler } : {}), ...(r.note ? { note: r.note } : {}),
    }));
  }

  /** `GET /admin/reports?status=&reason=&shop=&q=&sort=`: the reports with the counters of every state (they ignore the filters) and the shops that were reported. */
  async reports(f: { status?: string | undefined; reason?: string | undefined; shop?: string | undefined; q?: string | undefined; sort?: "newest" | "oldest" | undefined }) {
    const all = await this.reportRows();
    const q = f.q?.trim().toLowerCase();
    const items = all
      .filter((r) => (!f.status || r.status === f.status) && (!f.reason || r.reason === f.reason) && (!f.shop || r.shopSlug === f.shop) && (!q || [r.description, r.reporterEmail ?? "", r.shopSlug].some((t) => t.toLowerCase().includes(q))))
      .sort((a, b) => (f.sort === "oldest" ? 1 : -1) * (Date.parse(a.createdAt) - Date.parse(b.createdAt)) || a.id.localeCompare(b.id))
;
    return { items, counts: countReports(all), shops: [...new Set(all.map((r) => r.shopSlug))].sort() };
  }

  /** `PATCH /admin/reports/{id} {status, note?}`: an OPEN report is resolved or dismissed, once (`409 INVALID_TRANSITION` otherwise). */
  async decide(id: string, input: { status: "RESOLVED" | "DISMISSED"; note?: string | undefined }, actor: Actor) {
    if (input.note !== undefined && input.note.length > REPORT_NOTE_MAX) throw invalid({ note: "tooLong" });
    await this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(siteReports).where(eq(siteReports.id, id)).limit(1).for("update");
      if (!r) throw notFound("Report");
      if (r.status !== "OPEN") throw new ConflictException({ code: "INVALID_TRANSITION", message: "Only an open report can be resolved or dismissed." });
      await tx.update(siteReports).set({ status: input.status, note: input.note || null, handledBy: actor.userId, handledAt: new Date() }).where(eq(siteReports.id, id));
      await this.audit.record({ organizationId: r.organizationId, actorUserId: actor.userId, action: input.status === "RESOLVED" ? "report.resolve" : "report.dismiss", entityType: "site_report", entityId: id, ip: actor.ip }, tx);
    });
    return (await this.reportRows()).find((r) => r.id === id)!;
  }
}
