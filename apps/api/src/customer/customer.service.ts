import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { hashText, rankWorkshops, type WorkshopCategory } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { Actor } from "../catalog/workshops.service";
import { DB, type Database, type Executor } from "../db/db.module";
import { bookings, customerProfiles, favoriteWorkshops, organizations, users, workshopRatings, workshopSessions, workshops } from "../db/schema";
import { ratingSummaries } from "./ratings.service";

type BookingRow = typeof bookings.$inferSelect;
type SessionRow = typeof workshopSessions.$inferSelect;

const notFound = (what = "Account") => new NotFoundException({ code: "NOT_FOUND", message: `${what} not found.` });
const conflict = (code: string, message: string, details: Record<string, unknown> = {}) => new ConflictException({ code, message, details });
const fold = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").toLowerCase();

/** The customer may check in from this long before the session starts until it ends (FR-CUST-01). */
const CHECK_IN_OPENS_MINUTES = 60;

export interface ProfileInput {
  fullName: string; phone?: string | undefined; preferredLocale: string; country: string; birthDate: string; favoriteCategories: string[];
  gender?: string | undefined; socials?: Record<string, string> | undefined; avatarUrl?: string | undefined;
}

export interface Allowed { allowed: boolean; reason?: string; opensAt?: string }

/** Why a customer cannot check in now, or null when they can (the server decides: the screen shows the reason and the button is locked). */
export function checkInProblem(b: Pick<BookingRow, "status">, s: Pick<SessionRow, "startsAt" | "endsAt" | "status">, now: Date): { reason: string; opensAt?: string } | null {
  if (b.status === "CHECKED_IN") return { reason: "ALREADY_CHECKED_IN" };
  if (b.status === "CANCELLED") return { reason: "CANCELLED" };
  if (b.status === "NOT_CONFIRMED") return { reason: "NOT_CONFIRMED" }; // the link of the confirmation email has not been opened
  if (s.status === "CLOSED" || s.status === "COMPLETED") return { reason: "SESSION_CLOSED" };
  if (now.getTime() >= s.endsAt.getTime()) return { reason: "ENDED" };
  const opens = new Date(s.startsAt.getTime() - CHECK_IN_OPENS_MINUTES * 60_000);
  if (now.getTime() < opens.getTime()) return { reason: "TOO_EARLY", opensAt: opens.toISOString() };
  return null;
}

/** Why a customer cannot cancel now, or null: a booking not confirmed or confirmed, of a session that is open and has not started. */
export function cancelProblem(b: Pick<BookingRow, "status">, s: Pick<SessionRow, "startsAt" | "status">, now: Date): { reason: string } | null {
  if (b.status === "CANCELLED") return { reason: "CANCELLED" };
  if (b.status === "CHECKED_IN") return { reason: "CHECKED_IN" };
  if (s.status === "CLOSED" || s.status === "COMPLETED") return { reason: "SESSION_CLOSED" };
  if (now.getTime() >= s.startsAt.getTime()) return { reason: "STARTED" };
  return null;
}

/**
 * The area of a customer who has an account (FR-CUST-01): the profile, the bookings (found by the email of the account, in every shop) with check-in and rating, the workshops saved as favorites
 * and the Workshops page. The account always comes from the session (the controller checks the id of the path is its own); a booking of another account is the same 404 as an unknown one.
 */
@Injectable()
export class CustomerService {
  constructor(@Inject(DB) private readonly db: Database, @Inject(AuditService) private readonly audit: AuditService) {}

  // ---- the profile ----------------------------------------------------------------------------------------------------------------------------------------

  async profile(userId: string) {
    const [u] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw notFound();
    const [p] = await this.db.select().from(customerProfiles).where(eq(customerProfiles.userId, userId)).limit(1);
    return {
      id: u.id, fullName: u.fullName, email: u.email, ...(p?.phone ? { phone: p.phone } : {}), preferredLocale: u.uiLocale,
      account: { country: p?.country ?? "", birthDate: p?.birthDate ?? "", favoriteCategories: p?.favoriteCategories ?? [], ...(p?.gender ? { gender: p.gender } : {}), ...(p && Object.keys(p.socials).length > 0 ? { socials: p.socials } : {}), ...(p?.avatarUrl ? { avatarUrl: p.avatarUrl } : {}) },
    };
  }

  /** Replaces the profile (what is left out is removed; the email and the agreement given when registering stay). */
  async updateProfile(userId: string, input: ProfileInput, actor: Actor) {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ fullName: input.fullName, uiLocale: input.preferredLocale, updatedAt: new Date() }).where(eq(users.id, userId));
      const values = { phone: input.phone ?? "", country: input.country, birthDate: input.birthDate, favoriteCategories: input.favoriteCategories, gender: input.gender ?? null, socials: input.socials ?? {}, avatarUrl: input.avatarUrl ?? null, updatedAt: new Date() };
      await tx.insert(customerProfiles).values({ userId, ...values }).onConflictDoUpdate({ target: customerProfiles.userId, set: values });
      await this.audit.record({ actorUserId: userId, action: "customer.profile_update", entityType: "user", entityId: userId, ip: actor.ip }, tx); // nothing of the content: it is personal data
    });
    return this.profile(userId);
  }

  // ---- the bookings -----------------------------------------------------------------------------------------------------------------------------------------

  private async emailOf(executor: Executor, userId: string): Promise<string> {
    const [u] = await executor.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
    if (!u) throw notFound();
    return u.email;
  }

  private rowsOf(executor: Executor, email: string, bookingId?: string) {
    return executor
      .select({ b: bookings, s: workshopSessions, title: workshops.title, shop: organizations.name, slug: organizations.slug, rating: workshopRatings })
      .from(bookings)
      .innerJoin(workshopSessions, and(eq(workshopSessions.organizationId, bookings.organizationId), eq(workshopSessions.id, bookings.sessionId)))
      .innerJoin(workshops, and(eq(workshops.organizationId, bookings.organizationId), eq(workshops.id, bookings.workshopId)))
      .innerJoin(organizations, eq(organizations.id, bookings.organizationId))
      .leftJoin(workshopRatings, eq(workshopRatings.bookingId, bookings.id))
      .where(and(sql`lower(${bookings.guestEmail}) = ${email}`, bookingId ? eq(bookings.id, bookingId) : undefined))
      .orderBy(asc(workshopSessions.startsAt), asc(bookings.id));
  }

  private bookingView(r: Awaited<ReturnType<CustomerService["rowsOf"]>>[number], now: Date) {
    const { b, s } = r;
    const check = checkInProblem(b, s, now);
    const cancel = cancelProblem(b, s, now);
    // A rating that was removed by the administrator is not shown to the customer as a score, but the booking cannot be rated again.
    const rating = r.rating && !r.rating.removedAt ? { stars: r.rating.stars, comment: r.rating.comment, createdAt: r.rating.createdAt.toISOString() } : null;
    return {
      id: b.id, code: b.bookingCode, status: b.status, paymentStatus: b.paymentStatus, quantity: b.quantity, totalAmount: b.totalAmount, currency: b.currency, discounts: (b.snapshot.discounts ?? []).map((d) => ({ code: d.code, amount: d.amount })),
      shop: { name: r.shop, slug: r.slug }, workshop: { id: b.workshopId, title: r.title }, timezone: b.snapshot.timezone, address: b.snapshot.address,
      session: { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), status: s.status },
      specialRequest: b.specialRequest, cancelReason: b.cancelReason, cancelledBy: b.cancelledBy, checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null, createdAt: b.createdAt.toISOString(),
      canCheckIn: check ? { allowed: false, ...check } : { allowed: true },
      canCancel: cancel ? { allowed: false, ...cancel } : { allowed: true },
      canRate: b.status === "CHECKED_IN" && s.endsAt.getTime() <= now.getTime() && !r.rating,
      rating,
    };
  }

  /** `GET /customer/{id}/bookings`: the bookings made with the email of the account in every shop (no payment entries, no id of anybody else), and the time of the server. */
  async bookings(userId: string, now = new Date()) {
    const email = await this.emailOf(this.db, userId);
    return { bookings: (await this.rowsOf(this.db, email)).map((r) => this.bookingView(r, now)), now: now.toISOString() };
  }

  /** `POST /customer/{id}/bookings/{bookingId}/check-in`: from an hour before the start until the end, for a confirmed booking of a session that is not closed. */
  async checkIn(userId: string, bookingId: string, actor: Actor, now = new Date()) {
    const email = await this.emailOf(this.db, userId);
    await this.db.transaction(async (tx) => {
      const [found] = await this.rowsOf(tx, email, bookingId);
      if (!found) throw notFound("Booking"); // a booking of somebody else is the same 404
      await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId)).for("update");
      const [r] = await this.rowsOf(tx, email, bookingId);
      const problem = r ? checkInProblem(r.b, r.s, now) : { reason: "CANCELLED" };
      if (!r || problem) throw conflict("NOT_CHECKABLE", "This booking cannot be checked in now.", problem ?? {});
      await tx.update(bookings).set({ status: "CHECKED_IN", statusBeforeCheckIn: r.b.status, checkedInAt: now, statusChangedAt: now, updatedAt: now }).where(eq(bookings.id, bookingId));
      await this.audit.record({ organizationId: r.b.organizationId, actorUserId: userId, action: "booking.check_in", entityType: "booking", entityId: bookingId, before: { status: r.b.status }, after: { status: "CHECKED_IN", by: "CUSTOMER" }, ip: actor.ip }, tx);
    });
    const [r] = await this.rowsOf(this.db, email, bookingId);
    return this.bookingView(r!, now);
  }

  /** `POST /customer/{id}/bookings/{bookingId}/rating {stars, comment?}`: once for each booking, after the check-in and when the session is over. */
  async rate(userId: string, bookingId: string, input: { stars: number; comment?: string | undefined }, actor: Actor, now = new Date()) {
    const email = await this.emailOf(this.db, userId);
    return this.db.transaction(async (tx) => {
      const [r] = await this.rowsOf(tx, email, bookingId);
      if (!r) throw notFound("Booking");
      await tx.select({ id: bookings.id }).from(bookings).where(eq(bookings.id, bookingId)).for("update"); // two ratings at once: the second sees the first
      if (r.b.status !== "CHECKED_IN") throw conflict("NOT_CHECKED_IN", "You can rate a workshop after you checked in.");
      if (r.s.endsAt.getTime() > now.getTime()) throw conflict("NOT_ENDED", "You can rate a workshop after its session has ended.");
      const [already] = await tx.select({ id: workshopRatings.id }).from(workshopRatings).where(eq(workshopRatings.bookingId, bookingId)).limit(1);
      if (already) throw conflict("ALREADY_RATED", "This booking was already rated.");
      const [row] = await tx.insert(workshopRatings).values({ organizationId: r.b.organizationId, workshopId: r.b.workshopId, bookingId, userId, stars: input.stars, comment: input.comment || null }).returning();
      await this.audit.record({ organizationId: r.b.organizationId, actorUserId: userId, action: "booking.rate", entityType: "booking", entityId: bookingId, after: { code: r.b.bookingCode, stars: input.stars }, ip: actor.ip }, tx); // never the comment
      return { id: row!.id, stars: row!.stars, comment: row!.comment, createdAt: row!.createdAt.toISOString() };
    });
  }

  // ---- favorites and the Workshops page ----------------------------------------------------------------------------------------------------------------------------

  private async workshopCards(executor: Executor, userId: string, onlyFavorites: boolean) {
    const rows = await executor
      .select({ w: workshops, o: organizations, favorite: favoriteWorkshops.userId })
      .from(workshops).innerJoin(organizations, eq(organizations.id, workshops.organizationId))
      .leftJoin(favoriteWorkshops, and(eq(favoriteWorkshops.workshopId, workshops.id), eq(favoriteWorkshops.userId, userId)))
      // only the shops the platform chose, while they are active, and only the active workshops
      .where(and(eq(workshops.status, "ACTIVE"), eq(organizations.status, "ACTIVE"), eq(organizations.showOnCustomerPage, true), onlyFavorites ? sql`${favoriteWorkshops.userId} is not null` : undefined));
    const ratings = await ratingSummaries(executor, rows.map((r) => r.w.id));
    // `shopId` and `categories` are for the ranking only: the card the customer gets does not carry the id of the shop
    return rows.map(({ w, o, favorite }) => ({ id: w.id, shopId: o.id, categories: w.categories as WorkshopCategory[], card: {
      id: w.id, title: w.title, shortDescription: w.shortDescription, coverUrl: w.coverUrl, durationMinutes: w.durationMinutes, priceAmount: w.priceAmount, currency: w.currency,
      shop: { name: o.name, slug: o.slug }, rating: ratings.get(w.id) ?? { average: null, count: 0 }, favorite: favorite !== null,
    } }));
  }

  /** `GET /customer/{id}/workshops?q=`: the workshops of the shops the platform chose, in the order of `rankWorkshops` for this customer today (what they like first, the shops taking turns, the shop that leads changing each day). */
  async workshops(userId: string, q: string | undefined, now = new Date()) {
    const [p] = await this.db.select({ favorites: customerProfiles.favoriteCategories }).from(customerProfiles).where(eq(customerProfiles.userId, userId)).limit(1);
    const cards = await this.workshopCards(this.db, userId, false);
    const seed = Math.floor(now.getTime() / 86_400_000) + hashText(userId); // the day, mixed with the customer: it changes every day and differs from customer to customer
    const ranked = rankWorkshops(cards, (p?.favorites ?? []) as WorkshopCategory[], seed);
    const needle = fold(q?.trim() ?? "");
    const items = (needle ? ranked.filter((w) => fold(w.card.shop.name).includes(needle) || Object.values(w.card.title).some((t) => fold(t).includes(needle))) : ranked).map((w) => w.card);
    return { items, total: items.length };
  }

  /** `GET /customer/{id}/favorites`: the workshops the customer saved (of the shops the platform chose), newest saved first. */
  async favorites(userId: string) {
    const saved = await this.db.select({ id: favoriteWorkshops.workshopId, at: favoriteWorkshops.createdAt }).from(favoriteWorkshops).where(eq(favoriteWorkshops.userId, userId)).orderBy(desc(favoriteWorkshops.createdAt));
    const order = new Map(saved.map((s, i) => [s.id, i]));
    const cards = (await this.workshopCards(this.db, userId, true)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)).map((w) => w.card);
    return { items: cards, total: cards.length };
  }

  /** `PUT /customer/{id}/favorites/{workshopId}`: saves an active workshop of an active shop (a workshop of anywhere else is a 404). Saving twice is the same as once. */
  async addFavorite(userId: string, workshopId: string): Promise<void> {
    const [w] = await this.db.select({ organizationId: workshops.organizationId }).from(workshops).innerJoin(organizations, eq(organizations.id, workshops.organizationId))
      .where(and(eq(workshops.id, workshopId), eq(workshops.status, "ACTIVE"), eq(organizations.status, "ACTIVE"))).limit(1);
    if (!w) throw notFound("Workshop");
    await this.db.insert(favoriteWorkshops).values({ userId, organizationId: w.organizationId, workshopId }).onConflictDoNothing();
  }

  async removeFavorite(userId: string, workshopId: string): Promise<void> {
    await this.db.delete(favoriteWorkshops).where(and(eq(favoriteWorkshops.userId, userId), eq(favoriteWorkshops.workshopId, workshopId)));
  }
}
