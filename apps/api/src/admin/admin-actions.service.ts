import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import { SessionsService } from "../catalog/sessions.service";
import { WorkshopsService, type Actor } from "../catalog/workshops.service";
import { DB, type Database } from "../db/db.module";
import { organizationMembers, organizations, users } from "../db/schema";
import { OutboxService } from "../outbox/outbox.service";
import { SitePagesService } from "../site/site-pages.service";

/** What an administrator writes to explain a change made on behalf of a shop (D15): 1 to 300 characters. */
export const REASON_MAX = 300;

const reasonProblem = (field: "required" | "tooLong") => new UnprocessableEntityException({ code: "ADMIN_REASON_REQUIRED", message: "A reason is required for a change made on behalf of a shop.", details: { fields: { reason: field } } });

/**
 * What the platform administrator does ON BEHALF of a shop (D14, D15, FR-ADM-09 to FR-ADM-14): publish the landing page, activate or deactivate a workshop, close, re-open and move a session. Each
 * one needs a REASON (nothing at all happens without it), runs through the same services as the shop owner (so the same rules, the same audit line, and the guests of a closed or moved session are
 * told), then writes an `admin_edit.reason` audit line and tells the OWNERS of the shop by email what was changed and why. The administrator is not held by the limits of the owner (4 closes, 3 moves)
 * and may re-open a session closed for good. A suspended shop is read only for everybody; a shop in DRAFT is activated by its owner when they publish, never by the administrator.
 */
@Injectable()
export class AdminActionsService {
  constructor(
    @Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(WorkshopsService) private readonly workshops: WorkshopsService, @Inject(SessionsService) private readonly sessions: SessionsService, @Inject(SitePagesService) private readonly pages: SitePagesService,
  ) {}

  /** The reason, trimmed, or the refusal: checked before anything is looked up or changed. */
  private reason(raw: string | undefined): string {
    const reason = (raw ?? "").trim();
    if (!reason) throw reasonProblem("required");
    if (reason.length > REASON_MAX) throw reasonProblem("tooLong");
    return reason;
  }

  private async shop(shopId: string): Promise<OrgContext & { name: string }> {
    const [o] = await this.db.select({ id: organizations.id, slug: organizations.slug, name: organizations.name, status: organizations.status }).from(organizations).where(eq(organizations.id, shopId)).limit(1);
    if (!o) throw new NotFoundException({ code: "NOT_FOUND", message: "Shop not found." });
    return { id: o.id, slug: o.slug, name: o.name, status: o.status, role: "OWNER" };
  }

  /** After the change: the audit line with the reason, and the email to every active owner of the shop (what was changed, why). */
  private async done(org: OrgContext & { name: string }, actor: Actor, reason: string, entity: { type: string; id: string }, action: string, what: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "admin_edit.reason", entityType: entity.type, entityId: entity.id, after: { action, reason }, ip: actor.ip }, tx);
      const owners = await tx.select({ email: users.email, name: users.fullName }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(and(eq(organizationMembers.organizationId, org.id), eq(users.status, "ACTIVE")));
      for (const o of owners) await this.outbox.enqueueEmail(tx, { name: "admin-edit-notice", to: o.email, data: { name: o.name, shop: org.name, what, reason } }, org.id);
    });
    void this.outbox.wake();
  }

  async setWorkshopStatus(shopId: string, workshopId: string, status: "ACTIVE" | "DRAFT", rawReason: string | undefined, actor: Actor) {
    const reason = this.reason(rawReason);
    const org = await this.shop(shopId);
    const view = await this.workshops.switchStatus(org, workshopId, status, actor);
    await this.done(org, actor, reason, { type: "workshop", id: workshopId }, status === "ACTIVE" ? "workshop.activate" : "workshop.deactivate", `a workshop of your shop (${Object.values(view.title)[0] ?? ""}): it was ${status === "ACTIVE" ? "activated" : "deactivated"}`);
    return view;
  }

  /** Close a session (an open, a paused or a running one) whatever the number of times it was closed; the guests who booked it are told. */
  async closeSession(shopId: string, sessionId: string, rawReason: string | undefined, actor: Actor) {
    const reason = this.reason(rawReason);
    const org = await this.shop(shopId);
    const view = await this.sessions.close(org, sessionId, { code: "OTHER", note: reason }, actor, new Date(), { admin: true });
    await this.done(org, actor, reason, { type: "session", id: sessionId }, "session.close", `the session ${view.code} of your shop: it was closed`);
    return view;
  }

  /** Re-open a session that was closed before it started, including one the owner closed for good. */
  async reopenSession(shopId: string, sessionId: string, rawReason: string | undefined, actor: Actor) {
    const reason = this.reason(rawReason);
    const org = await this.shop(shopId);
    const view = await this.sessions.reopen(org, sessionId, actor, new Date(), { admin: true });
    await this.done(org, actor, reason, { type: "session", id: sessionId }, "session.reopen", `the session ${view.code} of your shop: it was opened again`);
    return view;
  }

  /** Move an open or a paused session to a new start (not limited to 3 times); the guests who booked it are told. */
  async rescheduleSession(shopId: string, sessionId: string, newStartsAt: string, rawReason: string | undefined, actor: Actor) {
    const reason = this.reason(rawReason);
    const org = await this.shop(shopId);
    const view = await this.sessions.reschedule(org, sessionId, { newStartsAt, reason: { code: "OTHER", note: reason } }, actor, new Date(), { admin: true });
    await this.done(org, actor, reason, { type: "session", id: sessionId }, "session.reschedule", `the session ${view.code} of your shop: it was moved`);
    return view;
  }

  /** Publish a draft of a landing page of an ACTIVE shop. A shop that is still a DRAFT is made ACTIVE by its owner when they publish, never by the administrator. */
  async publishPage(shopId: string, pageId: string, rawReason: string | undefined, actor: Actor) {
    const reason = this.reason(rawReason);
    const org = await this.shop(shopId);
    if (org.status === "DRAFT") throw new ConflictException({ code: "SHOP_NOT_ACTIVE", message: "A shop is made active by its owner when they publish their landing page." });
    const result = await this.pages.publish(org, pageId, actor);
    await this.done(org, actor, reason, { type: "site_page", id: pageId }, "site.publish", "the landing page of your shop: a new version was published");
    return result;
  }
}
