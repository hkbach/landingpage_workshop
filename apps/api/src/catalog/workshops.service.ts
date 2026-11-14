import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, count, eq, gt, inArray, or, sql, type SQL } from "drizzle-orm";
import { checkWorkshopSwitch, canEditWorkshop, isSessionFinished, type SessionStatus } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import { PromotionsService } from "../promotions/promotions.service";
import type { OrgContext } from "../auth/auth.guards";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database, type Executor } from "../db/db.module";
import { organizations, workshopSessions, workshops } from "../db/schema";
import { tenantScope } from "../tenant/tenant-scope";
import { assertShopWritable } from "../tenant/shop-writable";
import { autoCloseEnded } from "./session-sweeper";
import type { WorkshopInput } from "./workshop.schemas";

type WorkshopRow = typeof workshops.$inferSelect;

/** What the API shows of a workshop: the same names as the web app's `Workshop`, plus how many sessions it has. */
export interface WorkshopView {
  id: string; title: Record<string, string>; shortDescription: Record<string, string>; description: Record<string, string>; includes: Record<string, string[]>; notes: Record<string, string>;
  durationMinutes: number; priceAmount: number; currency: string; defaultCapacity: number; maxPerBooking: number; coverUrl: string; galleryUrls: string[];
  status: "DRAFT" | "ACTIVE"; sortOrder: number; categories: string[]; address: string; addressNote: string; createdAt: string; updatedAt: string;
  sessions: { open: number; total: number };
}

export interface Actor { userId: string; ip: string | null }

const LOCALIZED = ["title", "shortDescription", "description", "includes", "notes"] as const;
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);

const toView = (w: WorkshopRow, sessions = { open: 0, total: 0 }): WorkshopView => ({
  id: w.id, title: w.title, shortDescription: w.shortDescription, description: w.description, includes: w.includes, notes: w.notes, durationMinutes: w.durationMinutes, priceAmount: w.priceAmount,
  currency: w.currency, defaultCapacity: w.defaultCapacity, maxPerBooking: w.maxPerBooking, coverUrl: w.coverUrl, galleryUrls: w.galleryUrls, status: w.status, sortOrder: w.sortOrder,
  categories: w.categories, address: w.address, addressNote: w.addressNote, createdAt: w.createdAt.toISOString(), updatedAt: w.updatedAt.toISOString(), sessions,
});

/** The fields an audit line keeps when a workshop changes (REQUIREMENTS 8.7: the price and the status are audited; long texts are not copied into the log). */
const audited = (w: WorkshopRow) => ({
  priceAmount: w.priceAmount, currency: w.currency, durationMinutes: w.durationMinutes, defaultCapacity: w.defaultCapacity, maxPerBooking: w.maxPerBooking, categories: w.categories, address: w.address,
  sortOrder: w.sortOrder, status: w.status, titleLanguages: Object.keys(w.title).sort(),
});

@Injectable()
export class WorkshopsService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(PromotionsService) private readonly promotions: PromotionsService) {}

  private async shop(executor: Executor, org: OrgContext) {
    const [row] = await executor.select({ defaultLocale: organizations.defaultLocale, enabledLocales: organizations.enabledLocales, currency: organizations.currency }).from(organizations).where(eq(organizations.id, org.id)).limit(1);
    if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Not found." });
    return row;
  }

  /** The default language of the shop is required; no text may be written in a language the shop has not enabled. */
  private checkLanguages(shop: { defaultLocale: string; enabledLocales: string[] }, input: WorkshopInput): void {
    const fields: Record<string, string> = {};
    if (!input.title[shop.defaultLocale as keyof typeof input.title]) fields[`title.${shop.defaultLocale}`] = "required";
    for (const name of LOCALIZED) for (const l of Object.keys(input[name])) if (!shop.enabledLocales.includes(l)) fields[`${name}.${l}`] = "notEnabled";
    if (Object.keys(fields).length) throw new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
  }

  private async load(executor: Executor, org: OrgContext, id: string, lock = false): Promise<WorkshopRow> {
    const query = executor.select().from(workshops).where(and(tenantScope(workshops, org.id), eq(workshops.id, id))).limit(1);
    const [row] = lock ? await query.for("update") : await query;
    if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Workshop not found." }); // the same answer for an id that does not exist and one of another shop
    return row;
  }

  private async counts(executor: Executor, org: OrgContext, ids: string[]): Promise<Map<string, { open: number; total: number }>> {
    const out = new Map<string, { open: number; total: number }>();
    if (ids.length === 0) return out;
    const rows = await executor
      .select({ workshopId: workshopSessions.workshopId, status: workshopSessions.status, n: count() })
      .from(workshopSessions).where(and(tenantScope(workshopSessions, org.id), inArray(workshopSessions.workshopId, ids)))
      .groupBy(workshopSessions.workshopId, workshopSessions.status);
    for (const r of rows) {
      const c = out.get(r.workshopId) ?? { open: 0, total: 0 };
      c.total += r.n;
      if (!isSessionFinished(r.status)) c.open += r.n;
      out.set(r.workshopId, c);
    }
    return out;
  }

  async create(org: OrgContext, input: WorkshopInput, actor: Actor): Promise<WorkshopView> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      const shop = await this.shop(tx, org);
      this.checkLanguages(shop, input);
      const [row] = await tx.insert(workshops).values({ ...input, organizationId: org.id, currency: shop.currency, status: "DRAFT" }).returning();
      if (!row) throw new Error("The workshop was not created");
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "workshop.create", entityType: "workshop", entityId: row.id, after: audited(row), ip: actor.ip }, tx);
      return toView(row);
    });
  }

  async list(org: OrgContext, query: { q?: string | undefined; status?: "ACTIVE" | "DRAFT" | undefined; limit: number; cursor?: string | undefined }) {
    await autoCloseEnded(this.db, this.audit, { organizationId: org.id });
    const conditions: (SQL | undefined)[] = [tenantScope(workshops, org.id)];
    if (query.status) conditions.push(eq(workshops.status, query.status));
    if (query.q) conditions.push(sql`exists (select 1 from jsonb_each_text(${workshops.title}) as e where e.value ilike ${`%${escapeLike(query.q)}%`} escape '\\')`);
    if (query.cursor) {
      const c = decodeCursor<{ s: number; id: string }>(query.cursor, ["s", "id"]);
      conditions.push(or(gt(workshops.sortOrder, Number(c.s)), and(eq(workshops.sortOrder, Number(c.s)), gt(workshops.id, String(c.id)))));
    }
    const rows = await this.db.select().from(workshops).where(and(...conditions)).orderBy(asc(workshops.sortOrder), asc(workshops.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const counts = await this.counts(this.db, org, page.map((w) => w.id));
    const last = rows.length > query.limit ? page[page.length - 1] : undefined;
    return { items: page.map((w) => toView(w, counts.get(w.id))), nextCursor: last ? encodeCursor({ s: last.sortOrder, id: last.id }) : null };
  }

  async get(org: OrgContext, id: string): Promise<WorkshopView> {
    await autoCloseEnded(this.db, this.audit, { organizationId: org.id });
    const row = await this.load(this.db, org, id);
    return toView(row, (await this.counts(this.db, org, [id])).get(id));
  }

  /** Only a deactivated (DRAFT) workshop can be edited (FR-WS-01); an active one must be deactivated first. The currency and the status are not part of an edit. */
  async update(org: OrgContext, id: string, input: WorkshopInput, actor: Actor): Promise<WorkshopView> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      const shop = await this.shop(tx, org);
      this.checkLanguages(shop, input);
      const before = await this.load(tx, org, id, true);
      if (!canEditWorkshop(before.status)) throw new ConflictException({ code: "NOT_EDITABLE", message: "Deactivate the workshop before editing it." });
      const [row] = await tx.update(workshops).set({ ...input, updatedAt: new Date() }).where(and(tenantScope(workshops, org.id), eq(workshops.id, id))).returning();
      if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Workshop not found." });
      if (row.priceAmount !== before.priceAmount) await this.promotions.assertNotFree(tx, org.id, { id, priceAmount: row.priceAmount }); // (a lower price could make a fixed discount take all of it)
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "workshop.update", entityType: "workshop", entityId: id, before: audited(before), after: audited(row), ip: actor.ip }, tx);
      return toView(row, (await this.counts(tx, org, [id])).get(id));
    });
  }

  /** Activate (always allowed for a draft) or deactivate (only when every session is Closed or Completed: `409 SESSIONS_OPEN` with how many are not). */
  async switchStatus(org: OrgContext, id: string, to: "ACTIVE" | "DRAFT", actor: Actor): Promise<WorkshopView> {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      await autoCloseEnded(tx, this.audit, { organizationId: org.id });
      const before = await this.load(tx, org, id, true);
      const sessions = await tx.select({ status: workshopSessions.status }).from(workshopSessions).where(and(tenantScope(workshopSessions, org.id), eq(workshopSessions.workshopId, id)));
      const statuses = sessions.map((s) => s.status as SessionStatus);
      const problem = checkWorkshopSwitch(before.status, to, statuses);
      if (problem === "STATUS") throw new ConflictException({ code: "STATUS", message: "The workshop is already in that status." });
      if (problem === "SESSIONS_OPEN") throw new ConflictException({ code: "SESSIONS_OPEN", message: "A workshop can only be deactivated when all its sessions are closed.", details: { open: statuses.filter((s) => !isSessionFinished(s)).length } });
      const [row] = await tx.update(workshops).set({ status: to, updatedAt: new Date() }).where(and(tenantScope(workshops, org.id), eq(workshops.id, id))).returning();
      if (!row) throw new NotFoundException({ code: "NOT_FOUND", message: "Workshop not found." });
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: to === "ACTIVE" ? "workshop.activate" : "workshop.deactivate", entityType: "workshop", entityId: id, before: { status: before.status }, after: { status: row.status }, ip: actor.ip }, tx);
      return toView(row, (await this.counts(tx, org, [id])).get(id));
    });
  }
}
