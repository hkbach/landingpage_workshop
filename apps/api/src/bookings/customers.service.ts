import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, lt, or, sql, type SQL } from "drizzle-orm";
import type { OrgContext } from "../auth/auth.guards";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database } from "../db/db.module";
import { bookings, customers, workshopSessions } from "../db/schema";
import { tenantScope } from "../tenant/tenant-scope";

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/** The customers of the shop (FR-OPS): everybody who booked, found by email inside the shop (BR-10). Always read through the shop of the session. */
@Injectable()
export class CustomersService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async list(org: OrgContext, query: { q?: string | undefined; limit: number; cursor?: string | undefined }) {
    const conditions: (SQL | undefined)[] = [tenantScope(customers, org.id)];
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      conditions.push(or(sql`${customers.fullName} ilike ${like} escape '\\'`, sql`${customers.emailNormalized} ilike ${like} escape '\\'`, sql`${customers.phone} ilike ${like} escape '\\'`));
    }
    if (query.cursor) {
      const c = decodeCursor<{ t: string; id: string }>(query.cursor, ["t", "id"]);
      const at = new Date(String(c.t));
      if (Number.isNaN(at.getTime())) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
      conditions.push(or(lt(customers.createdAt, at), and(eq(customers.createdAt, at), lt(customers.id, String(c.id)))));
    }
    const rows = await this.db
      .select({
        c: customers,
        // The columns of the outer table are written with their table name: inside the sub-select an unqualified name would mean the column of `bookings`.
        bookingCount: sql<number>`(select count(*)::int from bookings b where b.organization_id = "customers"."organization_id" and b.customer_id = "customers"."id")`,
        lastBookingAt: sql<Date | null>`(select max(b.created_at) from bookings b where b.organization_id = "customers"."organization_id" and b.customer_id = "customers"."id")`,
      })
      .from(customers).where(and(...conditions)).orderBy(desc(customers.createdAt), desc(customers.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = rows.length > query.limit ? page[page.length - 1] : undefined;
    return {
      items: page.map((r) => ({
        id: r.c.id, fullName: r.c.fullName, email: r.c.emailNormalized, phone: r.c.phone, country: r.c.country, bookingCount: Number(r.bookingCount),
        lastBookingAt: r.lastBookingAt ? new Date(r.lastBookingAt).toISOString() : null, createdAt: r.c.createdAt.toISOString(),
      })),
      nextCursor: last ? encodeCursor({ t: last.c.createdAt.toISOString(), id: last.c.id }) : null,
    };
  }

  async get(org: OrgContext, id: string) {
    const [c] = await this.db.select().from(customers).where(and(tenantScope(customers, org.id), eq(customers.id, id))).limit(1);
    if (!c) throw new NotFoundException({ code: "NOT_FOUND", message: "Customer not found." });
    const list = await this.db
      .select({ b: bookings, sessionCode: workshopSessions.code, startsAt: workshopSessions.startsAt })
      .from(bookings)
      .innerJoin(workshopSessions, and(eq(workshopSessions.organizationId, bookings.organizationId), eq(workshopSessions.id, bookings.sessionId)))
      .where(and(tenantScope(bookings, org.id), eq(bookings.customerId, id))).orderBy(desc(bookings.createdAt)).limit(100);
    return {
      id: c.id, fullName: c.fullName, email: c.emailNormalized, phone: c.phone, country: c.country, preferredLocale: c.preferredLocale, createdAt: c.createdAt.toISOString(),
      bookings: list.map((r) => ({
        id: r.b.id, code: r.b.bookingCode, status: r.b.status, paymentStatus: r.b.paymentStatus, quantity: r.b.quantity, totalAmount: r.b.totalAmount, currency: r.b.currency,
        guestName: r.b.guestName, sessionCode: r.sessionCode, startsAt: r.startsAt.toISOString(), createdAt: r.b.createdAt.toISOString(),
      })),
    };
  }
}
