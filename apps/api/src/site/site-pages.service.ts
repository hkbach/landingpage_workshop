import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { MAX_LANDING_PAGES_PER_SHOP, replacedByPublish } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database, type Executor } from "../db/db.module";
import { organizations, sitePageVersions, sitePages, workshops, type PageContent } from "../db/schema";
import { assertShopWritable } from "../tenant/shop-writable";
import { tenantScope } from "../tenant/tenant-scope";

type PageRow = typeof sitePages.$inferSelect;

export interface PageSummary { id: string; name: string; templateKey: string; isLive: boolean; version: number; hasDraft: boolean; hasUnpublishedChanges: boolean; publishedAt: string | null; updatedAt: string }
export interface PageDetail extends PageSummary { theme: Record<string, unknown>; content: PageContent | null; source: "DRAFT" | "PUBLISHED" | "NONE" }

const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Landing page not found." }); // the same answer for an id that does not exist and one of another shop
const conflict = (code: string, message: string, details: Record<string, unknown> = {}) => new ConflictException({ code, message, details });
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

const summary = (p: PageRow): PageSummary => ({
  id: p.id, name: p.name, templateKey: p.templateKey, isLive: p.isLive, version: p.version, hasDraft: p.draftContent !== null,
  hasUnpublishedChanges: p.draftContent !== null && (p.publishedContent === null || !same(p.draftContent, p.publishedContent) || !same(p.theme, p.publishedTheme ?? {}) || p.templateKey !== p.publishedTemplateKey),
  publishedAt: p.publishedAt?.toISOString() ?? null, updatedAt: p.updatedAt.toISOString(),
});

/**
 * The landing pages of a shop (FR-SITE-04, FR-SITE-07). A draft is saved as the owner types and never changes the live page; Publish makes the draft the live page, takes any other live page
 * offline (one public page at a time), keeps the version, and, for a shop that is still a DRAFT, checks the list of what a first publish needs and makes the shop ACTIVE: there is no review
 * (BR-13).
 */
@Injectable()
export class SitePagesService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  private async load(executor: Executor, org: OrgContext, id: string, lock = false): Promise<PageRow> {
    const query = executor.select().from(sitePages).where(and(tenantScope(sitePages, org.id), eq(sitePages.id, id))).limit(1);
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw notFound();
    return row;
  }

  async list(org: OrgContext): Promise<{ items: PageSummary[]; limit: number }> {
    const rows = await this.db.select().from(sitePages).where(tenantScope(sitePages, org.id)).orderBy(asc(sitePages.createdAt), asc(sitePages.id));
    return { items: rows.map(summary), limit: MAX_LANDING_PAGES_PER_SHOP };
  }

  async create(org: OrgContext, input: { name: string; templateKey?: string | undefined }, actor: Actor): Promise<PageSummary> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      await tx.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, org.id)).for("update"); // two creations at once take turns: the limit holds
      const have = await tx.select({ id: sitePages.id }).from(sitePages).where(tenantScope(sitePages, org.id));
      if (have.length >= MAX_LANDING_PAGES_PER_SHOP) throw conflict("LIMIT", "A shop can have at most two landing pages.", { max: MAX_LANDING_PAGES_PER_SHOP });
      const [row] = await tx.insert(sitePages).values({ organizationId: org.id, name: input.name, ...(input.templateKey ? { templateKey: input.templateKey } : {}) }).returning();
      if (!row) throw new Error("The page was not created");
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "site.page_create", entityType: "site_page", entityId: row.id, after: { name: row.name, templateKey: row.templateKey }, ip: actor.ip }, tx);
      return summary(row);
    });
  }

  /** What the builder opens with: the saved draft, else the published page, else nothing (the editor then starts from the template's sample). */
  async get(org: OrgContext, id: string): Promise<PageDetail> {
    const p = await this.load(this.db, org, id);
    const content = p.draftContent ?? p.publishedContent ?? null;
    return { ...summary(p), theme: p.draftContent ? p.theme : (p.publishedTheme ?? p.theme), content, source: p.draftContent ? "DRAFT" : p.publishedContent ? "PUBLISHED" : "NONE" };
  }

  /** Autosave. Only the draft changes: the live page is untouched (AC of FR-SITE-02). */
  async saveDraft(org: OrgContext, id: string, input: { content: PageContent; theme?: Record<string, unknown> | undefined; templateKey?: string | undefined }): Promise<PageSummary> {
    assertShopWritable(org);
    const [row] = await this.db.update(sitePages).set({
      draftContent: input.content, updatedAt: new Date(),
      ...(input.theme ? { theme: input.theme } : {}), ...(input.templateKey ? { templateKey: input.templateKey } : {}),
    }).where(and(tenantScope(sitePages, org.id), eq(sitePages.id, id))).returning();
    if (!row) throw notFound();
    return summary(row);
  }

  /** What a first publish still needs (a shop that is a DRAFT): the contact details, a hero, and one ACTIVE workshop with a session still to come. Empty when the page can go public. */
  private async missing(executor: Executor, org: OrgContext, content: PageContent, now: Date): Promise<string[]> {
    const out: string[] = [];
    if (!content.sections.some((s) => s.type === "hero" && s.enabled)) out.push("HERO");
    const [shop] = await executor.select({ name: organizations.name, contactEmail: organizations.contactEmail, contactPhone: organizations.contactPhone }).from(organizations).where(eq(organizations.id, org.id)).limit(1);
    if (!shop?.name.trim()) out.push("SHOP_NAME");
    if (!shop?.contactEmail.trim() || !shop.contactPhone.trim()) out.push("CONTACT");
    const [ready] = await executor.select({ n: sql<number>`count(*)::int` }).from(workshops).where(and(
      tenantScope(workshops, org.id), eq(workshops.status, "ACTIVE"),
      sql`exists (select 1 from workshop_sessions s where s.organization_id = ${workshops.organizationId} and s.workshop_id = ${workshops.id} and s.starts_at > ${now.toISOString()}::timestamptz and s.status not in ('CLOSED', 'COMPLETED'))`,
    ));
    if (!ready || ready.n === 0) out.push("WORKSHOP_WITH_SESSION");
    return out;
  }

  async publish(org: OrgContext, id: string, actor: Actor, now = new Date()): Promise<PageDetail & { shopStatus: "DRAFT" | "ACTIVE" | "SUSPENDED"; firstPublish: boolean }> {
    assertShopWritable(org);
    await this.db.transaction(async (tx) => {
      const [shop] = await tx.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, org.id)).limit(1).for("update");
      if (!shop) throw notFound();
      if (shop.status === "SUSPENDED") throw new ForbiddenException({ code: "SHOP_SUSPENDED", message: "This shop is suspended and cannot publish." });
      const page = await this.load(tx, org, id, true);
      const content = page.draftContent ?? page.publishedContent;
      if (!content) throw conflict("NOTHING_TO_PUBLISH", "Save the page before publishing it.");
      if (shop.status === "DRAFT") {
        const missing = await this.missing(tx, org, content, now);
        if (missing.length > 0) throw conflict("CHECKLIST", "The shop is not ready to go public yet.", { missing });
      }
      const version = page.version + 1;
      const offline = replacedByPublish((await tx.select({ id: sitePages.id }).from(sitePages).where(and(tenantScope(sitePages, org.id), eq(sitePages.isLive, true)))).map((r) => r.id), id);
      if (offline.length > 0) await tx.update(sitePages).set({ isLive: false, updatedAt: now }).where(and(tenantScope(sitePages, org.id), inArray(sitePages.id, offline)));
      await tx.update(sitePages).set({
        publishedContent: content, publishedTheme: page.theme, publishedTemplateKey: page.templateKey, version, isLive: true, publishedAt: now, publishedBy: actor.userId, updatedAt: now,
        ...(page.draftContent ? {} : { draftContent: content }),
      }).where(and(tenantScope(sitePages, org.id), eq(sitePages.id, id)));
      await tx.insert(sitePageVersions).values({ organizationId: org.id, pageId: id, version, templateKey: page.templateKey, content, theme: page.theme, publishedBy: actor.userId, publishedAt: now });
      if (shop.status === "DRAFT") await tx.update(organizations).set({ status: "ACTIVE", updatedAt: now }).where(and(eq(organizations.id, org.id), eq(organizations.status, "DRAFT")));
      await this.audit.record({
        organizationId: org.id, actorUserId: actor.userId, action: "shop.publish", entityType: "site_page", entityId: id, before: { live: page.isLive, version: page.version }, after: { live: true, version, takenOffline: offline.length },
        ip: actor.ip,
      }, tx);
    });
    const [after] = await this.db.select({ status: organizations.status }).from(organizations).where(eq(organizations.id, org.id)).limit(1);
    const detail = await this.get(org, id);
    return { ...detail, shopStatus: after?.status ?? "ACTIVE", firstPublish: detail.version === 1 };
  }

  async versions(org: OrgContext, id: string) {
    await this.load(this.db, org, id);
    const rows = await this.db.select().from(sitePageVersions).where(and(tenantScope(sitePageVersions, org.id), eq(sitePageVersions.pageId, id))).orderBy(desc(sitePageVersions.version)).limit(50);
    return { items: rows.map((v) => ({ version: v.version, templateKey: v.templateKey, publishedAt: v.publishedAt.toISOString(), sections: v.content.sections.length })) };
  }

  /** Puts an earlier published version back as the DRAFT (the live page changes only when the owner publishes again). */
  async rollback(org: OrgContext, id: string, version: number, actor: Actor): Promise<PageDetail> {
    assertShopWritable(org);
    await this.db.transaction(async (tx) => {
      await this.load(tx, org, id, true);
      const [v] = await tx.select().from(sitePageVersions).where(and(tenantScope(sitePageVersions, org.id), eq(sitePageVersions.pageId, id), eq(sitePageVersions.version, version))).limit(1);
      if (!v) throw notFound();
      await tx.update(sitePages).set({ draftContent: v.content, theme: v.theme, templateKey: v.templateKey, updatedAt: new Date() }).where(and(tenantScope(sitePages, org.id), eq(sitePages.id, id)));
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "site.rollback", entityType: "site_page", entityId: id, after: { toVersion: version }, ip: actor.ip }, tx);
    });
    return this.get(org, id);
  }

  /** Deletes a page that is not public. A live page is taken offline by publishing another one (or stays: a shop always keeps the page it shows). */
  async remove(org: OrgContext, id: string, actor: Actor): Promise<void> {
    assertShopWritable(org);
    await this.db.transaction(async (tx) => {
      const page = await this.load(tx, org, id, true);
      if (page.isLive) throw conflict("PAGE_IS_LIVE", "A page that is public cannot be deleted.");
      await tx.delete(sitePageVersions).where(and(tenantScope(sitePageVersions, org.id), eq(sitePageVersions.pageId, id)));
      await tx.delete(sitePages).where(and(tenantScope(sitePages, org.id), eq(sitePages.id, id)));
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "site.page_delete", entityType: "site_page", entityId: id, before: { name: page.name }, ip: actor.ip }, tx);
    });
  }

  /** The public side: the page the shop shows (only an ACTIVE shop is ever asked), or null. */
  async livePage(organizationId: string): Promise<{ id: string; templateKey: string; theme: Record<string, unknown>; content: PageContent; version: number; publishedAt: string | null } | null> {
    // only the published columns: the draft and its theme (the largest jsonb of the row) are never read for the public page
    const [p] = await this.db.select({
      id: sitePages.id, templateKey: sitePages.templateKey, publishedTemplateKey: sitePages.publishedTemplateKey, publishedTheme: sitePages.publishedTheme, publishedContent: sitePages.publishedContent,
      version: sitePages.version, publishedAt: sitePages.publishedAt,
    }).from(sitePages).where(and(eq(sitePages.organizationId, organizationId), eq(sitePages.isLive, true))).limit(1);
    if (!p?.publishedContent) return null;
    return { id: p.id, templateKey: p.publishedTemplateKey ?? p.templateKey, theme: p.publishedTheme ?? {}, content: p.publishedContent, version: p.version, publishedAt: p.publishedAt?.toISOString() ?? null };
  }
}
