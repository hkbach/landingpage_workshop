import { ConflictException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, desc, eq, gte, lt, sql, type SQL } from "drizzle-orm";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../auth/auth.service";
import type { Actor } from "../catalog/workshops.service";
import { RateLimiter } from "../common/limiter";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { platformOrigin, shopOrigin } from "../common/origins";
import type { Env } from "../config/env";
import { ENV } from "../config/env.module";
import { DB, type Database } from "../db/db.module";
import { affiliateLinks, inviteLinks, organizations, referrals, users, workshops } from "../db/schema";
import { RatesBook } from "../finance/ledger";
import { AFFILIATE_CODE_RE, maskEmail, newCode } from "./codes";
import { affiliateEarnings, referralBonuses } from "./earnings";

type LinkRow = typeof affiliateLinks.$inferSelect;
export type LinkStatus = "ON_GOING" | "DEACTIVE";

const notFound = (what: string) => new NotFoundException({ code: "NOT_FOUND", message: `${what} not found.` });
const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);
const offsetOf = (cursor?: string): number => (cursor ? Math.max(0, Math.floor(Number(decodeCursor<{ o: number }>(cursor, ["o"]).o)) || 0) : 0);

/** A link counts (and opens a booking) while nobody switched it off and both the workshop and its shop are active; otherwise it is Deactive (FR-CUST-02). */
export const linkStatus = (link: Pick<LinkRow, "disabled">, workshopStatus: string, orgStatus: string): LinkStatus => (!link.disabled && workshopStatus === "ACTIVE" && orgStatus === "ACTIVE" ? "ON_GOING" : "DEACTIVE");

// ---- the service ----------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The affiliate links of a workshop and the invite link of a customer: the customer's side (FR-CUST-02, FR-CUST-03), the count of a visit (public) and the platform administrator's side
 * (FR-ADM-15, FR-ADM-18). The money is worked out in `earnings.ts` from the bookings as they are now.
 */
@Injectable()
export class AffiliateService {
  private readonly clicks = new RateLimiter(30, 60_000);

  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService, @Inject(ENV) private readonly env: Env) {}

  private linkUrl(slug: string, link: Pick<LinkRow, "code" | "workshopId">): string {
    return `${shopOrigin(this.env, slug)}/?ref=${link.code}&book=${link.workshopId}`;
  }

  // ---- the customer: affiliate links -----------------------------------------------------------------------------------------------------------------------------

  private async linkViews(userId: string, filter?: { linkId?: string }) {
    const rows = await this.db
      .select({ l: affiliateLinks, w: workshops, o: organizations })
      .from(affiliateLinks)
      .innerJoin(workshops, and(eq(workshops.organizationId, affiliateLinks.organizationId), eq(workshops.id, affiliateLinks.workshopId)))
      .innerJoin(organizations, eq(organizations.id, affiliateLinks.organizationId))
      .where(and(eq(affiliateLinks.userId, userId), filter?.linkId ? eq(affiliateLinks.id, filter.linkId) : undefined))
      .orderBy(desc(affiliateLinks.createdAt), desc(affiliateLinks.id));
    const earned = new Map((await affiliateEarnings(this.db, { userId })).map((e) => [e.linkId, e]));
    const book = await RatesBook.load(this.db, [...new Set(rows.map((r) => r.o.id))]);
    return rows.map(({ l, w, o }) => {
      const e = earned.get(l.id);
      const status = linkStatus(l, w.status, o.status);
      return {
        id: l.id, code: l.code, workshopId: w.id, workshopTitle: w.title, shopName: o.name, shopSlug: o.slug,
        // a link that is Deactive is shown but cannot be copied: the address is not given
        link: status === "ON_GOING" ? this.linkUrl(o.slug, l) : null,
        createdAt: l.createdAt.toISOString(), clicks: l.clicks, referralBps: book.currentOf(o.id).affiliateBps, bookings: e?.bookings ?? 0, referralFee: e?.fee ?? 0, currency: w.currency, status,
      };
    });
  }

  /** `GET /customer/{id}/referrals`: the links of the account and the workshops it can register for (active workshops of active shops), each with the Affiliate fee of its shop. */
  async myLinks(userId: string, q?: string) {
    const items = await this.linkViews(userId);
    const mine = new Map(items.map((i) => [i.workshopId, i.id]));
    const like = q ? `%${escapeLike(q)}%` : undefined;
    const open = await this.db.select({ w: workshops, o: organizations }).from(workshops).innerJoin(organizations, eq(organizations.id, workshops.organizationId))
      .where(and(eq(workshops.status, "ACTIVE"), eq(organizations.status, "ACTIVE"), like ? sql`(${workshops.title}::text ilike ${like} escape '\\' or ${organizations.name} ilike ${like} escape '\\')` : undefined))
      .orderBy(asc(organizations.name), asc(workshops.sortOrder), asc(workshops.id)).limit(100);
    const book = await RatesBook.load(this.db, [...new Set(open.map((r) => r.o.id))]);
    return {
      items,
      // The customer sees the Affiliate fee only: never the maintenance or the service fee.
      programs: open.map(({ w, o }) => ({
        workshopId: w.id, title: w.title, shortDescription: w.shortDescription, coverUrl: w.coverUrl, priceAmount: w.priceAmount, currency: w.currency, shopName: o.name, shopSlug: o.slug,
        referralBps: book.currentOf(o.id).affiliateBps, linkId: mine.get(w.id) ?? null,
      })),
    };
  }

  /** `POST /customer/{id}/referrals {workshopId}`: the link of the workshop, new (201) or the one the account already has (200). There is no way back. `409 WORKSHOP_INACTIVE` for a workshop that is not active (an old link is kept). */
  async register(userId: string, workshopId: string, actor: Actor): Promise<{ link: Awaited<ReturnType<AffiliateService["linkViews"]>>[number]; created: boolean }> {
    const existing = async () => {
      const [l] = await this.db.select({ id: affiliateLinks.id }).from(affiliateLinks).where(and(eq(affiliateLinks.userId, userId), eq(affiliateLinks.workshopId, workshopId))).limit(1);
      return l ? (await this.linkViews(userId, { linkId: l.id }))[0] : undefined;
    };
    const had = await existing();
    if (had) return { link: had, created: false };
    const [row] = await this.db.select({ w: workshops, o: organizations }).from(workshops).innerJoin(organizations, eq(organizations.id, workshops.organizationId)).where(eq(workshops.id, workshopId)).limit(1);
    if (!row) throw notFound("Workshop");
    if (row.w.status !== "ACTIVE" || row.o.status !== "ACTIVE") throw new ConflictException({ code: "WORKSHOP_INACTIVE", message: "This workshop is not active: a new affiliate link cannot be made for it." });
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const link = await this.db.transaction(async (tx) => {
          const [made] = await tx.insert(affiliateLinks).values({ userId, organizationId: row.o.id, workshopId, code: newCode("A") }).returning();
          if (!made) throw new Error("The link was not created");
          await this.audit.record({ organizationId: row.o.id, actorUserId: userId, action: "affiliate.register", entityType: "affiliate_link", entityId: made.id, after: { workshopId, code: made.code }, ip: actor.ip }, tx);
          return made;
        });
        return { link: (await this.linkViews(userId, { linkId: link.id }))[0]!, created: true };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const again = await existing(); // two requests at once: the second gets the link of the first; otherwise the code was taken, so try another
        if (again) return { link: again, created: false };
      }
    }
    throw new Error("A free affiliate code was not found");
  }

  // ---- the customer: the invite link ----------------------------------------------------------------------------------------------------------------------------

  private async inviteOf(userId: string) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const [own] = await this.db.select().from(inviteLinks).where(eq(inviteLinks.userId, userId)).limit(1);
      if (own) return own;
      try {
        await this.db.insert(inviteLinks).values({ userId, code: newCode("I") }).onConflictDoNothing({ target: inviteLinks.userId });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error; // the code was taken: another one on the next turn
      }
    }
    throw new Error("A free invite code was not found");
  }

  /** `GET /customer/{id}/invites`: the one invite link of the account (made the first time) and its friends with the bonus each earned (once, on the first paid booking after registering). */
  async myInvites(userId: string) {
    const invite = await this.inviteOf(userId);
    const friends = await this.db.select({ r: referrals, name: users.fullName, email: users.email }).from(referrals).innerJoin(users, eq(users.id, referrals.friendUserId))
      .where(eq(referrals.inviterUserId, userId)).orderBy(desc(referrals.createdAt), desc(referrals.id));
    const bonuses = new Map((await referralBonuses(this.db, { inviterUserId: userId })).map((b) => [b.referralId, b]));
    const earned = new Map<string, number>();
    for (const b of bonuses.values()) earned.set(b.currency, (earned.get(b.currency) ?? 0) + b.bonus);
    return {
      code: invite.code, disabled: invite.disabled, link: `${platformOrigin(this.env)}/?invite=${invite.code}`,
      items: friends.map(({ r, name, email }) => {
        const b = bonuses.get(r.id);
        return { id: r.id, name, email: maskEmail(email), registeredAt: r.createdAt.toISOString(), status: b ? ("EARNED" as const) : ("REGISTERED" as const), bonus: b?.bonus ?? 0, currency: b?.currency ?? null, ...(b ? { bookingCode: b.bookingCode, paidAt: b.paidAt ? b.paidAt.toISOString() : null } : {}) };
      }),
      total: friends.length,
      earned: [...earned].map(([currency, amount]) => ({ currency, amount })),
    };
  }

  // ---- public: a visit of a link ----------------------------------------------------------------------------------------------------------------------------------

  /**
   * `POST /public/sites/{slug}/referrals/click {code, count}`: the landing page counts a visit of an affiliate link (once for each visit of the browser). A link that is Deactive is still counted
   * (its visitor sees "workshop ended"). A code that does not belong to this shop, or a shop that is not active, is the same 404.
   */
  async click(slug: string, code: string, count: number, ip: string | null): Promise<{ workshopId: string; status: LinkStatus }> {
    const wait = this.clicks.retryAfter(`${ip ?? "unknown"}:${code}`);
    if (wait > 0) throw new HttpException({ code: "RATE_LIMITED", message: "Too many visits counted. Please try again later.", details: { retryAfterSeconds: wait } }, 429);
    this.clicks.hit(`${ip ?? "unknown"}:${code}`);
    if (!AFFILIATE_CODE_RE.test(code)) throw notFound("Link");
    const [row] = await this.db.select({ l: affiliateLinks, w: workshops, o: organizations }).from(affiliateLinks)
      .innerJoin(workshops, and(eq(workshops.organizationId, affiliateLinks.organizationId), eq(workshops.id, affiliateLinks.workshopId)))
      .innerJoin(organizations, eq(organizations.id, affiliateLinks.organizationId))
      .where(and(eq(affiliateLinks.code, code), eq(organizations.slug, slug))).limit(1);
    if (!row || row.o.status !== "ACTIVE") throw notFound("Link");
    await this.db.update(affiliateLinks).set({ clicks: sql`${affiliateLinks.clicks} + ${count}` }).where(eq(affiliateLinks.id, row.l.id));
    return { workshopId: row.w.id, status: linkStatus(row.l, row.w.status, row.o.status) };
  }

  // ---- the platform administrator: affiliate links ----------------------------------------------------------------------------------------------------------------

  /** `GET /admin/directory/affiliate`: every link with its owner, the visits, the paid bookings and the fee it made. Search: the email of the owner, the code, the workshop or the shop. */
  async adminLinks(q: { q?: string | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    const like = q.q ? `%${escapeLike(q.q)}%` : undefined;
    const conditions: (SQL | undefined)[] = [
      like ? sql`(${users.email} ilike ${like} escape '\\' or ${affiliateLinks.code} ilike ${like} escape '\\' or ${workshops.title}::text ilike ${like} escape '\\' or ${organizations.name} ilike ${like} escape '\\' or ${organizations.slug} ilike ${like} escape '\\')` : undefined,
      q.from ? gte(affiliateLinks.createdAt, new Date(`${q.from}T00:00:00Z`)) : undefined,
      q.to ? lt(affiliateLinks.createdAt, new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000)) : undefined,
    ];
    const offset = offsetOf(q.cursor);
    const rows = await this.db
      .select({ l: affiliateLinks, w: workshops, o: organizations, email: users.email, name: users.fullName })
      .from(affiliateLinks).innerJoin(users, eq(users.id, affiliateLinks.userId))
      .innerJoin(workshops, and(eq(workshops.organizationId, affiliateLinks.organizationId), eq(workshops.id, affiliateLinks.workshopId)))
      .innerJoin(organizations, eq(organizations.id, affiliateLinks.organizationId))
      .where(and(...conditions)).orderBy(desc(affiliateLinks.createdAt), desc(affiliateLinks.id)).limit(q.limit + 1).offset(offset);
    const earned = new Map((await affiliateEarnings(this.db)).map((e) => [e.linkId, e]));
    return {
      items: rows.slice(0, q.limit).map(({ l, w, o, email, name }) => ({
        id: l.id, code: l.code, accountId: l.userId, accountEmail: email, accountName: name, workshopId: w.id, workshopTitle: w.title, shopId: o.id, shopName: o.name, shopSlug: o.slug, currency: w.currency,
        createdAt: l.createdAt.toISOString(), clicks: l.clicks, bookings: earned.get(l.id)?.bookings ?? 0, referralFee: earned.get(l.id)?.fee ?? 0,
        status: linkStatus(l, w.status, o.status), disabled: l.disabled, disabledReason: l.disabledReason,
      })),
      nextCursor: rows.length > q.limit ? encodeCursor({ o: offset + q.limit }) : null,
    };
  }

  /** `POST /admin/affiliate/{id} {disabled, reason}`: switch a link off (a reason is required) or on. Switched off: it counts no new booking and its visitor sees "workshop ended"; what it earned stays. */
  async setLinkDisabled(id: string, input: { disabled: boolean; reason?: string | undefined }, actor: Actor) {
    if (input.disabled && !input.reason) throw invalid({ reason: "required" });
    return this.db.transaction(async (tx) => {
      const [l] = await tx.select().from(affiliateLinks).where(eq(affiliateLinks.id, id)).limit(1).for("update");
      if (!l) throw notFound("Link");
      if (l.disabled === input.disabled) throw new ConflictException({ code: "STATUS", message: input.disabled ? "This link is already switched off." : "This link is already on." });
      await tx.update(affiliateLinks).set({ disabled: input.disabled, disabledReason: input.disabled ? input.reason! : null }).where(eq(affiliateLinks.id, id));
      await this.audit.record({ organizationId: l.organizationId, actorUserId: actor.userId, action: input.disabled ? "affiliate.disable" : "affiliate.enable", entityType: "affiliate_link", entityId: id, before: { disabled: l.disabled }, after: { disabled: input.disabled, ...(input.disabled ? { reason: input.reason } : {}) }, ip: actor.ip }, tx);
      return { id, disabled: input.disabled, disabledReason: input.disabled ? input.reason! : null };
    });
  }

  // ---- the platform administrator: invite links -------------------------------------------------------------------------------------------------------------------

  /**
   * `GET /admin/directory/referrals`: the invite links with the friends who registered, those with a paid booking and the bonus paid. Search: the email of the owner, the code, or the email or name
   * of a friend. The dates narrow the friends to those who registered then (a link with no friend then is left out).
   */
  async adminInvites(q: { q?: string | undefined; from?: string | undefined; to?: string | undefined; limit: number; cursor?: string | undefined }) {
    const from = q.from ? new Date(`${q.from}T00:00:00Z`) : undefined;
    const to = q.to ? new Date(new Date(`${q.to}T00:00:00Z`).getTime() + 86_400_000) : undefined;
    const friends = await this.db.select({ r: referrals, name: users.fullName, email: users.email }).from(referrals).innerJoin(users, eq(users.id, referrals.friendUserId))
      .where(and(from ? gte(referrals.createdAt, from) : undefined, to ? lt(referrals.createdAt, to) : undefined)).orderBy(desc(referrals.createdAt), desc(referrals.id));
    const bonuses = new Map((await referralBonuses(this.db)).map((b) => [b.referralId, b]));
    const owners = await this.db.select({ l: inviteLinks, email: users.email, name: users.fullName }).from(inviteLinks).innerJoin(users, eq(users.id, inviteLinks.userId)).orderBy(desc(inviteLinks.createdAt), desc(inviteLinks.userId));
    const byOwner = new Map<string, typeof friends>();
    for (const f of friends) (byOwner.get(f.r.inviterUserId) ?? byOwner.set(f.r.inviterUserId, []).get(f.r.inviterUserId)!).push(f);
    const needle = q.q?.trim().toLowerCase();
    const items = owners.flatMap(({ l, email, name }) => {
      const mine = byOwner.get(l.userId) ?? [];
      if ((from || to) && mine.length === 0) return [];
      const matches = !needle || email.includes(needle) || l.code.toLowerCase().includes(needle) || mine.some((f) => f.email.includes(needle) || f.name.toLowerCase().includes(needle));
      if (!matches) return [];
      const earned = new Map<string, number>();
      let paidFriends = 0;
      for (const f of mine) { const b = bonuses.get(f.r.id); if (b) { paidFriends++; earned.set(b.currency, (earned.get(b.currency) ?? 0) + b.bonus); } }
      return [{
        accountId: l.userId, accountEmail: email, accountName: name, code: l.code, createdAt: l.createdAt.toISOString(), disabled: l.disabled, disabledReason: l.disabledReason,
        friends: mine.length, paidFriends, earned: [...earned].map(([currency, amount]) => ({ currency, amount })),
        // the detail: each friend with the state and the bonus (the whole email: an administrator looks up an account)
        items: mine.slice(0, 100).map((f) => { const b = bonuses.get(f.r.id); return { id: f.r.id, name: f.name, email: f.email, registeredAt: f.r.createdAt.toISOString(), status: b ? ("EARNED" as const) : ("REGISTERED" as const), bonus: b?.bonus ?? 0, currency: b?.currency ?? null, bookingCode: b?.bookingCode ?? null }; }),
      }];
    });
    const offset = offsetOf(q.cursor);
    return { items: items.slice(offset, offset + q.limit), nextCursor: offset + q.limit < items.length ? encodeCursor({ o: offset + q.limit }) : null };
  }

  /** `POST /admin/referrals/{accountId} {disabled, reason}`: switch the invite link of an account off (a reason is required) or on. Friends who registered before keep their bonus. */
  async setInviteDisabled(accountId: string, input: { disabled: boolean; reason?: string | undefined }, actor: Actor) {
    if (input.disabled && !input.reason) throw invalid({ reason: "required" });
    return this.db.transaction(async (tx) => {
      const [l] = await tx.select().from(inviteLinks).where(eq(inviteLinks.userId, accountId)).limit(1).for("update");
      if (!l) throw notFound("Invite link");
      if (l.disabled === input.disabled) throw new ConflictException({ code: "STATUS", message: input.disabled ? "This link is already switched off." : "This link is already on." });
      await tx.update(inviteLinks).set({ disabled: input.disabled, disabledReason: input.disabled ? input.reason! : null }).where(eq(inviteLinks.userId, accountId));
      await this.audit.record({ actorUserId: actor.userId, action: input.disabled ? "referral.disable" : "referral.enable", entityType: "invite_link", entityId: accountId, before: { disabled: l.disabled }, after: { disabled: input.disabled, ...(input.disabled ? { reason: input.reason } : {}) }, ip: actor.ip }, tx);
      return { accountId, disabled: input.disabled, disabledReason: input.disabled ? input.reason! : null };
    });
  }
}
