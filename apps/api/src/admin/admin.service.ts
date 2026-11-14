import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, desc, eq, gte, ilike, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { AuthService } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { DB, type Database } from "../db/db.module";
import { auditLogs, authSessions, organizationMembers, organizations, users } from "../db/schema";

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const notFound = (what: string) => new NotFoundException({ code: "NOT_FOUND", message: `${what} not found.` });
const reasonRequired = () => new UnprocessableEntityException({ code: "VALIDATION", message: "A reason is required.", details: { fields: { reason: "required" } } });

export type UserType = "SUPER_ADMIN" | "SHOP_OWNER" | "CUSTOMER";

/**
 * What a platform administrator does (REQUIREMENTS 5.8, SUPER_ADMIN only: every route is behind PlatformAdminGuard). Every change is audited with the administrator as the actor and the shop it
 * touched as the organization. An administrator never edits the slug of a shop (BR-21) and never sees a password or a token.
 */
@Injectable()
export class AdminService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(AuthService) private readonly auth: AuthService) {}

  // ---- shops ------------------------------------------------------------------------------------------------------------------------------------------------

  async listOrganizations(query: { q?: string | undefined; status?: "DRAFT" | "ACTIVE" | "SUSPENDED" | undefined; limit: number; cursor?: string | undefined }) {
    const conditions: (SQL | undefined)[] = [];
    if (query.status) conditions.push(eq(organizations.status, query.status));
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      conditions.push(or(sql`${organizations.name} ilike ${like} escape '\\'`, sql`${organizations.slug} ilike ${like} escape '\\'`, sql`${organizations.contactEmail} ilike ${like} escape '\\'`));
    }
    if (query.cursor) {
      const c = decodeCursor<{ t: string; id: string }>(query.cursor, ["t", "id"]);
      const at = new Date(String(c.t));
      if (Number.isNaN(at.getTime())) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
      conditions.push(or(lt(organizations.createdAt, at), and(eq(organizations.createdAt, at), lt(organizations.id, String(c.id)))));
    }
    const rows = await this.db
      .select({
        o: organizations,
        ownerEmail: sql<string | null>`(select u.email from organization_members m join users u on u.id = m.user_id where m.organization_id = "organizations"."id" and m.role = 'OWNER' order by m.created_at limit 1)`,
        workshopCount: sql<number>`(select count(*)::int from workshops w where w.organization_id = "organizations"."id")`,
        bookings30d: sql<number>`(select count(*)::int from bookings b where b.organization_id = "organizations"."id" and b.created_at > now() - interval '30 days')`,
        ownerName: sql<string | null>`(select u.full_name from organization_members m join users u on u.id = m.user_id where m.organization_id = "organizations"."id" and m.role = 'OWNER' order by m.created_at limit 1)`,
        sessionCount: sql<number>`(select count(*)::int from workshop_sessions s where s.organization_id = "organizations"."id")`,
        bookingCount: sql<number>`(select count(*)::int from bookings b where b.organization_id = "organizations"."id")`,
      })
      .from(organizations).where(and(...conditions)).orderBy(desc(organizations.createdAt), desc(organizations.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = rows.length > query.limit ? page[page.length - 1] : undefined;
    return {
      items: page.map((r) => ({
        id: r.o.id, name: r.o.name, slug: r.o.slug, status: r.o.status, statusReason: r.o.statusReason, country: r.o.country, timezone: r.o.timezone, currency: r.o.currency,
        contactEmail: r.o.contactEmail, ownerEmail: r.ownerEmail, workshopCount: Number(r.workshopCount), bookings30d: Number(r.bookings30d), createdAt: r.o.createdAt.toISOString(),
        // what the admin screens show and edit without asking for each shop again
        ownerName: r.ownerName, contactPhone: r.o.contactPhone, whatsapp: r.o.whatsapp, mapsUrl: r.o.mapsUrl, address: r.o.address, defaultLocale: r.o.defaultLocale, enabledLocales: r.o.enabledLocales,
        customDomain: r.o.customDomain, customDomainVerified: r.o.customDomainVerifiedAt !== null, showOnCustomerPage: r.o.showOnCustomerPage, sessionCount: Number(r.sessionCount), bookingCount: Number(r.bookingCount),
      })),
      nextCursor: last ? encodeCursor({ t: last.o.createdAt.toISOString(), id: last.o.id }) : null,
    };
  }

  /** Lists the workshops of a shop on the Workshops page of the customers, or stops listing them (the shop is shown only while it is ACTIVE). Audited. */
  async setVisibility(id: string, show: boolean, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [o] = await tx.select({ show: organizations.showOnCustomerPage }).from(organizations).where(eq(organizations.id, id)).limit(1).for("update");
      if (!o) throw notFound("Shop");
      await tx.update(organizations).set({ showOnCustomerPage: show, updatedAt: new Date() }).where(eq(organizations.id, id));
      await this.audit.record({ organizationId: id, actorUserId: actor.userId, action: "organization.visibility", entityType: "organization", entityId: id, before: { showOnCustomerPage: o.show }, after: { showOnCustomerPage: show }, ip: actor.ip }, tx);
      return { id, showOnCustomerPage: show };
    });
  }

  async getOrganization(id: string) {
    const [o] = await this.db.select().from(organizations).where(eq(organizations.id, id)).limit(1);
    if (!o) throw notFound("Shop");
    const [counts] = await this.db
      .select({
        workshops: sql<number>`(select count(*)::int from workshops where organization_id = "organizations"."id")`,
        bookings: sql<number>`(select count(*)::int from bookings where organization_id = "organizations"."id")`,
        customers: sql<number>`(select count(*)::int from customers where organization_id = "organizations"."id")`,
      })
      .from(organizations).where(eq(organizations.id, id)).limit(1);
    const owners = await this.db.select({ id: users.id, email: users.email, fullName: users.fullName, status: users.status }).from(organizationMembers).innerJoin(users, eq(users.id, organizationMembers.userId)).where(eq(organizationMembers.organizationId, id)).orderBy(asc(organizationMembers.createdAt));
    return {
      id: o.id, name: o.name, slug: o.slug, status: o.status, statusReason: o.statusReason, country: o.country, timezone: o.timezone, currency: o.currency, defaultLocale: o.defaultLocale, enabledLocales: o.enabledLocales,
      contactEmail: o.contactEmail, contactPhone: o.contactPhone, whatsapp: o.whatsapp, address: o.address, mapsUrl: o.mapsUrl, createdAt: o.createdAt.toISOString(),
      counts: { workshops: Number(counts?.workshops ?? 0), bookings: Number(counts?.bookings ?? 0), customers: Number(counts?.customers ?? 0) }, owners,
    };
  }

  /** Suspend an ACTIVE shop (a reason is required, the owner and the guests see the shop as unavailable and its data is read only) or reactivate a SUSPENDED one. Nothing else changes state here. */
  async setOrganizationActive(id: string, active: boolean, reason: string | undefined, actor: Actor) {
    if (!active && !reason) throw reasonRequired();
    return this.db.transaction(async (tx) => {
      const [o] = await tx.select().from(organizations).where(eq(organizations.id, id)).limit(1).for("update");
      if (!o) throw notFound("Shop");
      if (active ? o.status !== "SUSPENDED" : o.status !== "ACTIVE") throw new ConflictException({ code: "STATUS", message: active ? "Only a suspended shop can be reactivated." : "Only an active shop can be suspended.", details: { status: o.status } });
      const next = active ? "ACTIVE" : "SUSPENDED";
      await tx.update(organizations).set({ status: next, statusReason: active ? null : reason ?? null, updatedAt: new Date() }).where(eq(organizations.id, id));
      await this.audit.record({ organizationId: id, actorUserId: actor.userId, action: active ? "organization.reactivate" : "organization.suspend", entityType: "organization", entityId: id, before: { status: o.status }, after: { status: next, ...(reason ? { reason } : {}) }, ip: actor.ip }, tx);
      return { id, status: next as "ACTIVE" | "SUSPENDED" };
    });
  }

  // ---- users ------------------------------------------------------------------------------------------------------------------------------------------------

  async listUsers(query: { q?: string | undefined; type?: UserType | undefined; status?: "UNVERIFIED" | "ACTIVE" | "DISABLED" | undefined; limit: number; cursor?: string | undefined }) {
    const conditions: (SQL | undefined)[] = [];
    if (query.status) conditions.push(eq(users.status, query.status));
    if (query.type === "SUPER_ADMIN") conditions.push(eq(users.platformRole, "SUPER_ADMIN"));
    if (query.type === "SHOP_OWNER") conditions.push(sql`exists (select 1 from organization_members m where m.user_id = "users"."id")`);
    if (query.type === "CUSTOMER") conditions.push(sql`"users"."platform_role" is null and not exists (select 1 from organization_members m where m.user_id = "users"."id")`);
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      conditions.push(or(sql`${users.email} ilike ${like} escape '\\'`, sql`${users.fullName} ilike ${like} escape '\\'`));
    }
    if (query.cursor) {
      const c = decodeCursor<{ t: string; id: string }>(query.cursor, ["t", "id"]);
      const at = new Date(String(c.t));
      if (Number.isNaN(at.getTime())) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
      conditions.push(or(lt(users.createdAt, at), and(eq(users.createdAt, at), lt(users.id, String(c.id)))));
    }
    const rows = await this.db
      .select({
        u: { id: users.id, email: users.email, fullName: users.fullName, status: users.status, platformRole: users.platformRole, createdAt: users.createdAt, lastLoginAt: users.lastLoginAt, emailVerifiedAt: users.emailVerifiedAt },
        shopSlug: sql<string | null>`(select o.slug from organization_members m join organizations o on o.id = m.organization_id where m.user_id = "users"."id" order by m.created_at limit 1)`,
        shopName: sql<string | null>`(select o.name from organization_members m join organizations o on o.id = m.organization_id where m.user_id = "users"."id" order by m.created_at limit 1)`,
        shopId: sql<string | null>`(select o.id from organization_members m join organizations o on o.id = m.organization_id where m.user_id = "users"."id" order by m.created_at limit 1)`,
        bookingCount: sql<number>`(select count(*)::int from bookings b join customers c on c.id = b.customer_id where c.email_normalized = lower("users"."email"))` // (stored lowercase: a plain comparison, served by customers_email_idx),
      })
      .from(users).where(and(...conditions)).orderBy(desc(users.createdAt), desc(users.id)).limit(query.limit + 1); // the password hash is never selected
    const page = rows.slice(0, query.limit);
    const last = rows.length > query.limit ? page[page.length - 1] : undefined;
    return {
      items: page.map((r) => ({
        id: r.u.id, email: r.u.email, fullName: r.u.fullName, status: r.u.status, type: (r.u.platformRole === "SUPER_ADMIN" ? "SUPER_ADMIN" : r.shopSlug ? "SHOP_OWNER" : "CUSTOMER") as UserType, shopSlug: r.shopSlug, shopName: r.shopName, shopId: r.shopId, bookingCount: Number(r.bookingCount),
        createdAt: r.u.createdAt.toISOString(), lastLoginAt: r.u.lastLoginAt?.toISOString() ?? null, emailVerified: r.u.emailVerifiedAt !== null,
      })),
      nextCursor: last ? encodeCursor({ t: last.u.createdAt.toISOString(), id: last.u.id }) : null,
    };
  }

  /** Disable (a reason is required; every session of the account ends at once) or re-enable an account. An administrator cannot disable their own account. */
  async setUserStatus(id: string, status: "ACTIVE" | "DISABLED", reason: string | undefined, actor: Actor) {
    if (status === "DISABLED" && !reason) throw reasonRequired();
    if (status === "DISABLED" && id === actor.userId) throw new ConflictException({ code: "SELF", message: "You cannot disable your own account." });
    return this.db.transaction(async (tx) => {
      const [u] = await tx.select({ id: users.id, status: users.status, email: users.email }).from(users).where(eq(users.id, id)).limit(1).for("update");
      if (!u) throw notFound("User");
      if (u.status === status) throw new ConflictException({ code: "STATUS", message: "The account is already in that status." });
      await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, id));
      if (status === "DISABLED") await tx.delete(authSessions).where(eq(authSessions.userId, id));
      const [org] = await tx.select({ id: organizationMembers.organizationId }).from(organizationMembers).where(eq(organizationMembers.userId, id)).limit(1);
      await this.audit.record({ organizationId: org?.id ?? null, actorUserId: actor.userId, action: status === "DISABLED" ? "user.deactivate" : "user.activate", entityType: "user", entityId: id, before: { status: u.status }, after: { status, targetEmail: u.email, ...(reason ? { reason } : {}) }, ip: actor.ip }, tx);
      return { id, status };
    });
  }

  /** Sends the account a link to choose a new password (the administrator never sets or sees a password). */
  async resetUserPassword(id: string, actor: Actor): Promise<void> {
    const [u] = await this.db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!u) throw notFound("User");
    await this.auth.sendPasswordResetLink(id, actor.userId, actor.ip);
  }

  // ---- the audit log of the whole platform ---------------------------------------------------------------------------------------------------------------

  async auditLogs(query: { email?: string | undefined; org?: string | undefined; action?: string | undefined; entityType?: string | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    const conditions: (SQL | undefined)[] = [];
    if (query.email) conditions.push(ilike(users.email, `%${escapeLike(query.email)}%`));
    if (query.org) {
      const like = `%${escapeLike(query.org)}%`;
      conditions.push(sql`${auditLogs.organizationId} in (select id from organizations where name ilike ${like} escape '\\' or slug ilike ${like} escape '\\' or id::text = ${query.org})`);
    }
    if (query.action) conditions.push(eq(auditLogs.action, query.action));
    if (query.entityType) conditions.push(eq(auditLogs.entityType, query.entityType));
    if (query.from) conditions.push(gte(auditLogs.createdAt, new Date(query.from)));
    if (query.to) conditions.push(lte(auditLogs.createdAt, new Date(query.to)));
    if (query.cursor) {
      const c = decodeCursor<{ t: string; id: string }>(query.cursor, ["t", "id"]);
      const at = new Date(String(c.t));
      if (Number.isNaN(at.getTime())) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
      conditions.push(or(sql`date_trunc('milliseconds', ${auditLogs.createdAt}) < ${at.toISOString()}::timestamptz`, and(sql`date_trunc('milliseconds', ${auditLogs.createdAt}) = ${at.toISOString()}::timestamptz`, lt(auditLogs.id, String(c.id)))));
    }
    const rows = await this.db
      .select({ a: auditLogs, actorEmail: users.email, orgSlug: organizations.slug })
      .from(auditLogs)
      .leftJoin(users, eq(users.id, auditLogs.actorUserId))
      .leftJoin(organizations, eq(organizations.id, auditLogs.organizationId))
      .where(and(...conditions)).orderBy(desc(sql`date_trunc('milliseconds', ${auditLogs.createdAt})`), desc(auditLogs.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const last = rows.length > query.limit ? page[page.length - 1] : undefined;
    return {
      items: page.map((r) => ({
        id: r.a.id, action: r.a.action, entityType: r.a.entityType, entityId: r.a.entityId, organizationId: r.a.organizationId, organizationSlug: r.orgSlug, actorUserId: r.a.actorUserId, actorEmail: r.actorEmail ?? null,
        actor: r.a.actorUserId ? "USER" : "SYSTEM", before: r.a.before, after: r.a.after, ip: r.a.ip, createdAt: r.a.createdAt.toISOString(),
      })),
      nextCursor: last ? encodeCursor({ t: last.a.createdAt.toISOString(), id: last.a.id }) : null,
    };
  }
}
