import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import {
  MAX_CONCURRENT_PROMOTIONS, MAX_PROMOTIONS_PER_SHOP, bookingsBlockingPause, canEditPromotion, firstOverloadedDay, fullDiscountWorkshops, isPromotionCodeTaken, isPromotionDeletable, promotionStatus,
  type PromotionInput, type PromotionRecord, type PromotionStatus,
} from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import type { Actor } from "../catalog/workshops.service";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { dateIn } from "../common/zoned-time";
import { DB, type Database, type Executor } from "../db/db.module";
import { organizations, promotions, workshops } from "../db/schema";
import { assertShopWritable } from "../tenant/shop-writable";
import { tenantScope } from "../tenant/tenant-scope";

type Row = typeof promotions.$inferSelect;

const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Promotion not found." }); // the same answer for an id that does not exist and one of another shop
const unprocessable = (fields: Record<string, string>, message = "Please check the highlighted fields.", extra: Record<string, unknown> = {}) => new UnprocessableEntityException({ code: "VALIDATION", message, details: { fields, ...extra } });
const conflict = (code: string, message: string, details: Record<string, unknown> = {}) => new ConflictException({ code, message, details });
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/** A row as the rules of `packages/shared` know a promotion. */
export const toRecord = (r: Row): PromotionRecord => ({
  id: r.id, title: r.title as PromotionRecord["title"], description: r.description as PromotionRecord["description"], discountType: r.discountType, discountValue: r.discountValue, code: r.code,
  ...(r.imageUrl ? { imageUrl: r.imageUrl } : {}), stacking: r.stacking, appliesTo: r.appliesTo as "ALL" | "SELECTED", workshopIds: r.workshopIds, startDate: r.startDate, endDate: r.endDate,
  enabled: r.enabled, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
});

/** What the owner's screen gets: the promotion, its state today and, when the platform paused it, why (the owner cannot resume it). */
const view = (r: Row, today: string) => ({ ...toRecord(r), status: promotionStatus(toRecord(r), today), ...(r.heldReason ? { heldByAdmin: r.heldReason } : {}) });

/**
 * The promotions of a shop (FR-PROMO-01) and what the platform administrator does with them (FR-ADM-25). Every write of a shop runs under one lock of its promotions, so the limits (20 in all, 5 at
 * once, no workshop for nothing) cannot be passed by two requests at the same time. The shop comes from the session; the dates are the business dates of the shop.
 */
@Injectable()
export class PromotionsService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  private async todayOf(executor: Executor, organizationId: string, now: Date): Promise<string> {
    const [o] = await executor.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, organizationId)).limit(1);
    return dateIn(now, o?.timezone ?? "UTC");
  }

  private async lock(tx: Executor, organizationId: string): Promise<void> {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`promotions:${organizationId}`}))`);
  }

  private async shopWorkshops(executor: Executor, organizationId: string) {
    return executor.select({ id: workshops.id, priceAmount: workshops.priceAmount }).from(workshops).where(tenantScope(workshops, organizationId));
  }

  /** The bookings that stop a promotion from being paused: it was used on a booking that is still live and whose session has not ended. */
  private async pauseBlockers(executor: Executor, organizationId: string, promotionId: string, now: Date): Promise<string[]> {
    const used = (await executor.execute(sql`
      select b.id, b.booking_code, b.status, b.promotion_ids, s.ends_at, s.status as session_status
        from bookings b join workshop_sessions s on s.organization_id = b.organization_id and s.id = b.session_id
       where b.organization_id = ${organizationId} and ${promotionId}::uuid = any(b.promotion_ids)`)).rows as { id: string; booking_code: string; status: string; promotion_ids: string[]; ends_at: string | Date; session_status: string }[];
    return bookingsBlockingPause(promotionId, used.map((u) => ({ id: u.id, bookingCode: u.booking_code, status: u.status, promotionIds: u.promotion_ids, sessionEndsAt: new Date(u.ends_at).toISOString(), sessionStatus: u.session_status })), now).map((b) => b.bookingCode);
  }

  /** The two rules that look at the other promotions: nobody may get a workshop for nothing, and no more than 5 run at once. */
  private async checkCrowd(executor: Executor, organizationId: string, candidate: PromotionRecord, others: PromotionRecord[], today: string): Promise<void> {
    const free = fullDiscountWorkshops(candidate, others, await this.shopWorkshops(executor, organizationId), today);
    if (free.length > 0) throw new UnprocessableEntityException({ code: "FULL_DISCOUNT", message: "A guest could get 100% off a workshop with this promotion, so it cannot be saved.", details: { fields: { discountValue: "fullDiscount" }, workshopIds: free.map((f) => f.workshopId) } });
    const date = firstOverloadedDay([...others, candidate], today);
    if (date) throw conflict("CONCURRENT_LIMIT", `At most ${MAX_CONCURRENT_PROMOTIONS} promotions can run at the same time.`, { date, max: MAX_CONCURRENT_PROMOTIONS });
  }

  private async checkWorkshops(executor: Executor, organizationId: string, ids: readonly string[]): Promise<void> {
    if (ids.length === 0) return;
    const known = new Set((await this.shopWorkshops(executor, organizationId)).map((w) => w.id));
    if (ids.some((id) => !known.has(id))) throw unprocessable({ workshopIds: "workshopUnknown" }); // a workshop of another shop looks like none
  }

  private values(input: PromotionInput) {
    return {
      title: input.title as Record<string, string>, description: input.description as Record<string, string>, discountType: input.discountType, discountValue: input.discountValue, code: input.code,
      imageUrl: input.imageUrl ? input.imageUrl : null, stacking: input.stacking, appliesTo: input.appliesTo, workshopIds: input.appliesTo === "ALL" ? [] : [...new Set(input.workshopIds)],
      startDate: input.startDate, endDate: input.endDate, enabled: input.enabled,
    };
  }

  // ---- the owner ------------------------------------------------------------------------------------------------------------------------------------------------

  /** `GET /promotions`: every promotion of the shop, newest first, with today's date of the shop (the status depends on it) and the limits. */
  async list(org: OrgContext, now = new Date()) {
    const today = await this.todayOf(this.db, org.id, now);
    const rows = await this.db.select().from(promotions).where(tenantScope(promotions, org.id)).orderBy(desc(promotions.createdAt), desc(promotions.id));
    return { items: rows.map((r) => view(r, today)), today, limit: MAX_PROMOTIONS_PER_SHOP, maxConcurrent: MAX_CONCURRENT_PROMOTIONS };
  }

  async create(org: OrgContext, input: PromotionInput, actor: Actor, now = new Date()) {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, org.id);
      const today = await this.todayOf(tx, org.id, now);
      const all = await tx.select().from(promotions).where(tenantScope(promotions, org.id));
      if (all.length >= MAX_PROMOTIONS_PER_SHOP) throw conflict("LIMIT_REACHED", `A shop can have at most ${MAX_PROMOTIONS_PER_SHOP} promotions.`, { max: MAX_PROMOTIONS_PER_SHOP });
      await this.checkWorkshops(tx, org.id, input.workshopIds);
      if (input.endDate < today) throw unprocessable({ endDate: "endInPast" }, "The last day cannot be before today.");
      if (isPromotionCodeTaken(all.map(toRecord), input.code)) throw unprocessable({ code: "codeTaken" }, "Another promotion of your shop already uses this code.");
      const [row] = await tx.insert(promotions).values({ organizationId: org.id, ...this.values(input) }).returning();
      if (!row) throw new Error("The promotion was not created");
      await this.checkCrowd(tx, org.id, toRecord(row), all.map(toRecord), today); // inside the transaction: a refusal rolls the row back
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "promotion.create", entityType: "promotion", entityId: row.id, after: { code: row.code, discountType: row.discountType, discountValue: row.discountValue }, ip: actor.ip }, tx);
      return view(row, today);
    });
  }

  /** Replaces a promotion. Only a paused or an over one is edited (an active or scheduled one is paused first, so guests never see it change). */
  async update(org: OrgContext, id: string, input: PromotionInput, actor: Actor, now = new Date()) {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, org.id);
      const today = await this.todayOf(tx, org.id, now);
      const all = await tx.select().from(promotions).where(tenantScope(promotions, org.id));
      const prev = all.find((p) => p.id === id);
      if (!prev) throw notFound();
      await this.checkWorkshops(tx, org.id, input.workshopIds);
      if (isPromotionCodeTaken(all.map(toRecord), input.code, id)) throw unprocessable({ code: "codeTaken" }, "Another promotion of your shop already uses this code.");
      if (input.enabled && prev.heldReason) throw conflict("HELD_BY_ADMIN", "This promotion was paused by the platform. Only an administrator can resume it.");
      if (!canEditPromotion(promotionStatus(toRecord(prev), today))) throw conflict("EDIT_NOT_ALLOWED", "An active promotion cannot be edited. Pause it first.");
      if (input.endDate < today) throw unprocessable({ endDate: "endInPast" }, "The last day cannot be before today.");
      if (prev.enabled && !input.enabled) {
        const used = await this.pauseBlockers(tx, org.id, id, now);
        if (used.length > 0) throw conflict("PROMOTION_IN_USE", "Guests are using this promotion in bookings of sessions that have not ended, so it cannot be paused yet.", { count: used.length, bookingCodes: used.slice(0, 10) });
      }
      const [row] = await tx.update(promotions).set({ ...this.values(input), updatedAt: now }).where(and(tenantScope(promotions, org.id), eq(promotions.id, id))).returning();
      if (!row) throw notFound();
      await this.checkCrowd(tx, org.id, toRecord(row), all.filter((p) => p.id !== id).map(toRecord), today);
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "promotion.update", entityType: "promotion", entityId: id, before: { code: prev.code, discountValue: prev.discountValue }, after: { code: row.code, discountValue: row.discountValue }, ip: actor.ip }, tx);
      return view(row, today);
    });
  }

  /** Pause or resume. Pausing is refused while a live booking of a session that has not ended uses it; resuming is like adding it again (no free workshop, no more than 5 at once, not over, not held). */
  async setEnabled(org: OrgContext, id: string, enabled: boolean, actor: Actor, now = new Date()) {
    assertShopWritable(org);
    return this.db.transaction(async (tx) => {
      await this.lock(tx, org.id);
      const today = await this.todayOf(tx, org.id, now);
      const all = await tx.select().from(promotions).where(tenantScope(promotions, org.id));
      const p = all.find((x) => x.id === id);
      if (!p) throw notFound();
      if (enabled && p.heldReason) throw conflict("HELD_BY_ADMIN", "This promotion was paused by the platform. Only an administrator can resume it.");
      if (!enabled && p.enabled) {
        const used = await this.pauseBlockers(tx, org.id, id, now);
        if (used.length > 0) throw conflict("PROMOTION_IN_USE", "Guests are using this promotion in bookings of sessions that have not ended, so it cannot be paused yet.", { count: used.length, bookingCodes: used.slice(0, 10) });
      }
      if (enabled && !p.enabled && p.endDate < today) throw unprocessable({ endDate: "endInPast" }, "The last day cannot be before today.");
      if (enabled) await this.checkCrowd(tx, org.id, { ...toRecord(p), enabled: true }, all.filter((x) => x.id !== id).map(toRecord), today);
      const [row] = await tx.update(promotions).set({ enabled, updatedAt: now }).where(and(tenantScope(promotions, org.id), eq(promotions.id, id))).returning();
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: enabled ? "promotion.resume" : "promotion.pause", entityType: "promotion", entityId: id, ip: actor.ip }, tx);
      return view(row!, today);
    });
  }

  /** Only a paused or an over promotion is deleted (never one that is active or still to start). A booking that used it keeps its discount. */
  async remove(org: OrgContext, id: string, actor: Actor, now = new Date()): Promise<void> {
    assertShopWritable(org);
    await this.db.transaction(async (tx) => {
      await this.lock(tx, org.id);
      const today = await this.todayOf(tx, org.id, now);
      const [p] = await tx.select().from(promotions).where(and(tenantScope(promotions, org.id), eq(promotions.id, id))).limit(1);
      if (!p) throw notFound();
      if (!isPromotionDeletable(toRecord(p), today)) throw conflict("DELETE_NOT_ALLOWED", "Only a paused or expired promotion can be deleted. Pause it first.");
      await tx.delete(promotions).where(and(tenantScope(promotions, org.id), eq(promotions.id, id)));
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "promotion.delete", entityType: "promotion", entityId: id, before: { code: p.code }, ip: actor.ip }, tx);
    });
  }

  /**
   * A workshop whose price changes must not become free with the promotions of the shop (the rule that is checked when a promotion is saved, checked from the other side): `422 FULL_DISCOUNT`
   * on `priceAmount`. Takes the promotions lock, so a promotion saved at the same moment waits for it.
   */
  async assertNotFree(tx: Executor, organizationId: string, workshop: { id: string; priceAmount: number }, now = new Date()): Promise<void> {
    await this.lock(tx, organizationId);
    const today = await this.todayOf(tx, organizationId, now);
    const all = (await tx.select().from(promotions).where(tenantScope(promotions, organizationId))).map(toRecord).filter((p) => p.enabled);
    if (all.some((p) => fullDiscountWorkshops(p, all.filter((x) => x.id !== p.id), [workshop], today).length > 0)) {
      throw new UnprocessableEntityException({ code: "FULL_DISCOUNT", message: "At this price a guest could get the workshop for nothing with the promotions of your shop.", details: { fields: { priceAmount: "fullDiscount" } } });
    }
  }

  // ---- the guest (public) -----------------------------------------------------------------------------------------------------------------------------------

  /** The promotions guests see on the landing page of a shop: active today, newest start first. */
  async activeFor(executor: Executor, organizationId: string, today: string): Promise<PromotionRecord[]> {
    const rows = await executor.select().from(promotions).where(and(tenantScope(promotions, organizationId), eq(promotions.enabled, true)));
    return rows.map(toRecord).filter((p) => promotionStatus(p, today) === "ACTIVE").sort((a, b) => b.startDate.localeCompare(a.startDate));
  }

  // ---- the platform administrator ----------------------------------------------------------------------------------------------------------------------------

  /** `GET /admin/directory/promotions`: the promotions of every shop with the bookings that used them and what they took off. Search: code, title (any language), shop; filter: status. */
  async adminList(q: { q?: string | undefined; status?: PromotionStatus | undefined; limit: number; cursor?: string | undefined }, now = new Date()) {
    const like = q.q ? `%${escapeLike(q.q)}%` : undefined;
    const conditions: (SQL | undefined)[] = [like ? or(ilike(promotions.code, like), sql`${promotions.title}::text ilike ${like} escape '\\'`, ilike(organizations.name, like), ilike(organizations.slug, like)) : undefined];
    const rows = await this.db.select({ p: promotions, o: organizations }).from(promotions).innerJoin(organizations, eq(organizations.id, promotions.organizationId)).where(and(...conditions)).orderBy(desc(promotions.createdAt), desc(promotions.id));
    const usage = new Map(((await this.db.execute(sql`
      select (d->>'promotionId')::uuid as id, count(distinct b.id)::int as bookings, coalesce(sum((d->>'amount')::bigint), 0)::bigint as total
        from bookings b cross join lateral jsonb_array_elements(coalesce(b.snapshot->'discounts', '[]'::jsonb)) d
       where b.status <> 'CANCELLED' and d ? 'promotionId' group by 1`)).rows as { id: string; bookings: number; total: string }[]).map((r) => [r.id, r]));
    const all = rows.map(({ p, o }) => {
      const status = promotionStatus(toRecord(p), dateIn(now, o.timezone));
      const u = usage.get(p.id);
      return { ...toRecord(p), status, heldByAdmin: p.heldReason, shopId: o.id, shopName: o.name, shopSlug: o.slug, currency: o.currency, usedBookings: u?.bookings ?? 0, discountTotal: Number(u?.total ?? 0) };
    }).filter((p) => !q.status || p.status === q.status);
    const offset = q.cursor ? Math.max(0, Math.floor(Number(decodeCursor<{ o: number }>(q.cursor, ["o"]).o)) || 0) : 0;
    return { items: all.slice(offset, offset + q.limit), nextCursor: offset + q.limit < all.length ? encodeCursor({ o: offset + q.limit }) : null };
  }

  /**
   * `POST /admin/promotions/{id} {hold, reason?}`: the platform pauses a promotion that breaks the rules (a reason is required; it stops being applied at once, the owner sees it as paused by the
   * platform and cannot resume it, and the bookings that used it keep their discount) or resumes one it paused (it runs again when it was running before, is not over, and keeps the rules of a resume).
   */
  async hold(id: string, input: { hold: boolean; reason?: string | undefined }, actor: Actor, now = new Date()) {
    if (input.hold && !input.reason) throw unprocessable({ reason: "required" });
    return this.db.transaction(async (tx) => {
      const [found] = await tx.select({ organizationId: promotions.organizationId }).from(promotions).where(eq(promotions.id, id)).limit(1);
      if (!found) throw notFound();
      await this.lock(tx, found.organizationId);
      const all = await tx.select().from(promotions).where(tenantScope(promotions, found.organizationId));
      const p = all.find((x) => x.id === id);
      if (!p) throw notFound();
      const today = await this.todayOf(tx, found.organizationId, now);
      let patch: Partial<Row>;
      if (input.hold) {
        if (p.heldReason) throw conflict("ALREADY_HELD", "This promotion is already paused by the platform.");
        patch = { enabled: false, heldReason: input.reason!, heldAt: now, heldBy: actor.userId, heldWasEnabled: p.enabled };
      } else {
        if (!p.heldReason) throw conflict("NOT_HELD", "This promotion is not paused by the platform.");
        // It runs again only when it was running, is not over and keeps the rules of a resume; otherwise the hold is lifted and it stays paused (the owner can resume it when the rules allow).
        let runs = Boolean(p.heldWasEnabled) && p.endDate >= today;
        if (runs) {
          try { await this.checkCrowd(tx, found.organizationId, { ...toRecord(p), enabled: true }, all.filter((x) => x.id !== id).map(toRecord), today); } catch { runs = false; }
        }
        patch = { enabled: runs, heldReason: null, heldAt: null, heldBy: null, heldWasEnabled: null };
      }
      const [row] = await tx.update(promotions).set({ ...patch, updatedAt: now }).where(eq(promotions.id, id)).returning();
      await this.audit.record({ organizationId: found.organizationId, actorUserId: actor.userId, action: input.hold ? "promotion.pause" : "promotion.resume", entityType: "promotion", entityId: id, after: input.hold ? { held: true, reason: input.reason } : { held: false, enabled: row!.enabled }, ip: actor.ip }, tx);
      return { id, enabled: row!.enabled, heldByAdmin: row!.heldReason };
    });
  }
}
