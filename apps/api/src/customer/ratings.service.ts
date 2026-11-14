import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database, type Executor } from "../db/db.module";
import { bookings, organizations, users, workshopRatings, workshops } from "../db/schema";
import { tenantScope } from "../tenant/tenant-scope";
import { olderThan, readKeyset, tsOf, writeKeyset } from "../common/keyset";

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const round1 = (n: number): number => Math.round(n * 10) / 10;

export interface RatingSummary { average: number | null; count: number }

/** The score of each workshop: the average of the stars that were not removed, one decimal, and how many (REQUIREMENTS FR-CUST-01: a workshop with none shows "No ratings yet"). */
export async function ratingSummaries(executor: Executor, workshopIds: readonly string[]): Promise<Map<string, RatingSummary>> {
  const out = new Map<string, RatingSummary>(workshopIds.map((id) => [id, { average: null, count: 0 }]));
  if (workshopIds.length === 0) return out;
  const rows = await executor.select({ id: workshopRatings.workshopId, avg: sql<string>`avg(${workshopRatings.stars})`, n: sql<number>`count(*)::int` }).from(workshopRatings)
    .where(and(inArray(workshopRatings.workshopId, [...workshopIds]), isNull(workshopRatings.removedAt))).groupBy(workshopRatings.workshopId);
  for (const r of rows) out.set(r.id, { average: round1(Number(r.avg)), count: Number(r.n) });
  return out;
}

/**
 * The ratings customers gave to workshops (FR-CUST-01 "Rate this workshop", FR-ADM-27): the shop owner reads those of their own workshops (read only, none that were removed), the platform
 * administrator reads all of them and removes (with a reason) or puts back one that breaks the rules. A rating that was removed stops counting in the score of the workshop. The comment is plain text
 * and is never written to the audit log.
 */
@Injectable()
export class RatingsService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  /** `GET /ratings`: the ratings of the workshops of the shop (newest first, none removed) with their average and count. */
  async forShop(org: OrgContext) {
    const rows = await this.db
      .select({ r: workshopRatings, title: workshops.title, code: bookings.bookingCode })
      .from(workshopRatings)
      .innerJoin(workshops, and(eq(workshops.organizationId, workshopRatings.organizationId), eq(workshops.id, workshopRatings.workshopId)))
      .innerJoin(bookings, and(eq(bookings.organizationId, workshopRatings.organizationId), eq(bookings.id, workshopRatings.bookingId)))
      .where(and(tenantScope(workshopRatings, org.id), isNull(workshopRatings.removedAt))).orderBy(desc(workshopRatings.createdAt), desc(workshopRatings.id));
    const count = rows.length;
    return {
      items: rows.map(({ r, title, code }) => ({ id: r.id, stars: r.stars, comment: r.comment, workshopId: r.workshopId, workshopTitle: title, bookingCode: code, createdAt: r.createdAt.toISOString() })),
      average: count ? round1(rows.reduce((n, x) => n + x.r.stars, 0) / count) : null,
      count,
    };
  }

  /** `GET /admin/directory/ratings`: every rating with the workshop, the shop, the booking and the customer. Search: comment, workshop, shop, booking code, customer; filter: status, stars. */
  async adminList(q: { q?: string | undefined; status?: "SHOWN" | "REMOVED" | undefined; stars?: number | undefined; limit: number; cursor?: string | undefined }) {
    const like = q.q ? `%${escapeLike(q.q)}%` : undefined;
    const conditions: (SQL | undefined)[] = [
      q.status === "SHOWN" ? isNull(workshopRatings.removedAt) : q.status === "REMOVED" ? sql`${workshopRatings.removedAt} is not null` : undefined,
      q.stars ? eq(workshopRatings.stars, q.stars) : undefined,
      like ? sql`(${workshopRatings.comment} ilike ${like} escape '\\' or ${workshops.title}::text ilike ${like} escape '\\' or ${organizations.name} ilike ${like} escape '\\' or ${bookings.bookingCode} ilike ${like} escape '\\' or ${users.email} ilike ${like} escape '\\' or ${users.fullName} ilike ${like} escape '\\')` : undefined,
    ];
    const after = readKeyset(q.cursor);
    if (after) conditions.push(olderThan(workshopRatings.createdAt, workshopRatings.id, after));
    const rows = await this.db
      .select({ r: workshopRatings, ts: tsOf(workshopRatings.createdAt), title: workshops.title, shop: organizations.name, slug: organizations.slug, code: bookings.bookingCode, name: users.fullName, email: users.email })
      .from(workshopRatings)
      .innerJoin(workshops, and(eq(workshops.organizationId, workshopRatings.organizationId), eq(workshops.id, workshopRatings.workshopId)))
      .innerJoin(organizations, eq(organizations.id, workshopRatings.organizationId))
      .innerJoin(bookings, and(eq(bookings.organizationId, workshopRatings.organizationId), eq(bookings.id, workshopRatings.bookingId)))
      .innerJoin(users, eq(users.id, workshopRatings.userId))
      .where(and(...conditions)).orderBy(desc(workshopRatings.createdAt), desc(workshopRatings.id)).limit(q.limit + 1);
    return {
      items: rows.slice(0, q.limit).map(({ r, title, shop, slug, code, name, email }) => ({
        id: r.id, workshopId: r.workshopId, workshopTitle: title, shopName: shop, shopSlug: slug, bookingCode: code, customer: { id: r.userId, name, email }, stars: r.stars, comment: r.comment,
        createdAt: r.createdAt.toISOString(), status: r.removedAt ? ("REMOVED" as const) : ("SHOWN" as const), removedReason: r.removedReason,
      })),
      nextCursor: rows.length > q.limit ? writeKeyset(rows[q.limit - 1]!.ts, rows[q.limit - 1]!.r.id) : null,
    };
  }

  /** `POST /admin/ratings/{id} {removed, reason?}`: remove (a reason is required) or put back. A customer cannot rate that booking again either way. */
  async setRemoved(id: string, input: { removed: boolean; reason?: string | undefined }, actor: Actor) {
    if (input.removed && !input.reason) throw new UnprocessableEntityException({ code: "VALIDATION", message: "A reason is required.", details: { fields: { reason: "required" } } });
    return this.db.transaction(async (tx) => {
      const [r] = await tx.select().from(workshopRatings).where(eq(workshopRatings.id, id)).limit(1).for("update");
      if (!r) throw new NotFoundException({ code: "NOT_FOUND", message: "Rating not found." });
      if (input.removed && r.removedAt) throw new ConflictException({ code: "ALREADY_REMOVED", message: "This rating was already removed." });
      if (!input.removed && !r.removedAt) throw new ConflictException({ code: "NOT_REMOVED", message: "This rating is not removed." });
      await tx.update(workshopRatings).set(input.removed ? { removedAt: new Date(), removedReason: input.reason!, removedBy: actor.userId } : { removedAt: null, removedReason: null, removedBy: null }).where(eq(workshopRatings.id, id));
      const [b] = await tx.select({ code: bookings.bookingCode }).from(bookings).where(and(eq(bookings.organizationId, r.organizationId), eq(bookings.id, r.bookingId))).limit(1);
      await this.audit.record({ organizationId: r.organizationId, actorUserId: actor.userId, action: input.removed ? "rating.remove" : "rating.restore", entityType: "rating", entityId: id, after: { bookingCode: b?.code, ...(input.removed ? { reason: input.reason } : {}) }, ip: actor.ip }, tx); // never the comment
      return { id, status: input.removed ? ("REMOVED" as const) : ("SHOWN" as const), removedReason: input.removed ? input.reason! : null };
    });
  }
}
