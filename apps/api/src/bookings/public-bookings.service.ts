import { randomInt } from "node:crypto";
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, desc, eq, gt, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { canTransition, confirmation, eligiblePromotions, formatMoney, priceBooking, workshopAddress } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import { hashToken, newToken, safeEqual } from "../auth/crypto";
import { TurnstileService } from "../auth/turnstile.service";
import { RateLimiter } from "../common/limiter";
import { dateIn } from "../common/zoned-time";
import type { Env } from "../config/env";
import { ENV, SECRETS } from "../config/env.module";
import type { Secrets } from "../common/secrets";
import { DB, type Database, type Executor } from "../db/db.module";
import { bookingConfirmations, bookingOtps, bookings, customers, organizations, workshopSessions, workshops } from "../db/schema";
import { isUniqueViolation } from "../auth/auth.service";
import type { BookingMailData } from "../email/templates";
import { affiliateLinkFor } from "../affiliate/attribution";
import { ratingSummaries } from "../customer/ratings.service";
import { PromotionsService } from "../promotions/promotions.service";
import { shopOrigin } from "../common/origins";
import { OutboxService } from "../outbox/outbox.service";
import { SitePagesService } from "../site/site-pages.service";
import type { BookingCreateInput } from "./booking.schemas";
import { SessionCapacityService } from "./session-capacity.service";

export interface PublicClient { ip: string | null }

type OrgRow = typeof organizations.$inferSelect;
type BookingRow = typeof bookings.$inferSelect;

const OTP_MINUTES = 10;
const OTP_MAX_TRIES = 5;
const OTP_COOLDOWN_MS = 30_000;
const CONFIRM_DAYS = 14;

const fields = (f: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields: f } });
const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Not found." });
const throttled = (seconds: number) => new HttpException({ code: "RATE_LIMITED", message: "Too many attempts. Please try again later.", details: { retryAfterSeconds: seconds } }, 429);

export { shopOrigin };


/** What a guest is shown of a booking (never an id, a payment or another guest). */
export interface PublicBooking {
  code: string; status: BookingRow["status"]; quantity: number; totalAmount: number; currency: string; guestName: string;
  workshopTitle: Record<string, string>; startsAt: string; endsAt: string; timezone: string; address: string; cancelReason: string | null; cancelledBy: "SHOP" | "GUEST" | null;
  canCancel: boolean;
}

/**
 * The public side of booking (FR-BOOK-01..03): what a guest can do without an account, on the landing page of a shop. Nothing here takes a shop id or a price from the client: the shop is
 * the one of the slug (and must be ACTIVE; anything else is the same 404), the price is worked out on the server (BR-04).
 */
@Injectable()
export class PublicBookingsService {
  private readonly otpByIp = new RateLimiter(20, 60 * 60_000);
  private readonly otpByEmail = new RateLimiter(5, 60 * 60_000);
  private readonly lookups = new RateLimiter(30, 15 * 60_000);
  private readonly creates = new RateLimiter(30, 60 * 60_000);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(SECRETS) private readonly secrets: Secrets,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(TurnstileService) private readonly turnstile: TurnstileService,
    @Inject(SessionCapacityService) private readonly capacity: SessionCapacityService,
    @Inject(SitePagesService) private readonly pages: SitePagesService,
    @Inject(PromotionsService) private readonly promotions: PromotionsService,
  ) {}

  // ---- the shop and what it offers ------------------------------------------------------------------------------------------------------------------------

  /** The shop of a slug, only while it is ACTIVE: a draft, a suspended or an unknown shop is the same 404 (REQUIREMENTS 3.3). */
  private async shop(slug: string): Promise<OrgRow> {
    const [row] = await this.db.select().from(organizations).where(eq(organizations.slug, slug)).limit(1);
    if (!row || row.status !== "ACTIVE") throw notFound();
    return row;
  }

  async site(slug: string) {
    const o = await this.shop(slug);
    const list = await this.db.select().from(workshops).where(and(eq(workshops.organizationId, o.id), eq(workshops.status, "ACTIVE"))).orderBy(asc(workshops.sortOrder), asc(workshops.id));
    const page = await this.pages.livePage(o.id); // what the owner published (null while there is none)
    const ratings = await ratingSummaries(this.db, list.map((w) => w.id));
    const running = await this.promotions.activeFor(this.db, o.id, dateIn(new Date(), o.timezone)); // the promotions of today, for the "Promotions" section and the booking form
    return {
      page: page ? { templateKey: page.templateKey, theme: page.theme, content: page.content, version: page.version, publishedAt: page.publishedAt } : null,
      shop: { name: o.name, slug: o.slug, country: o.country, timezone: o.timezone, currency: o.currency, defaultLocale: o.defaultLocale, enabledLocales: o.enabledLocales, contactEmail: o.contactEmail, contactPhone: o.contactPhone, whatsapp: o.whatsapp, address: o.address, mapsUrl: o.mapsUrl },
      promotions: running.map((r) => ({ id: r.id, title: r.title, description: r.description, discountType: r.discountType, discountValue: r.discountValue, code: r.code, imageUrl: r.imageUrl ?? null, stacking: r.stacking, appliesTo: r.appliesTo, workshopIds: r.workshopIds, startDate: r.startDate, endDate: r.endDate })),
      workshops: list.map((w) => ({
        rating: ratings.get(w.id) ?? { average: null, count: 0 }, id: w.id, title: w.title, shortDescription: w.shortDescription, description: w.description, includes: w.includes, notes: w.notes, durationMinutes: w.durationMinutes, priceAmount: w.priceAmount, currency: w.currency,
        maxPerBooking: w.maxPerBooking, coverUrl: w.coverUrl, galleryUrls: w.galleryUrls, categories: w.categories, address: workshopAddress({ address: w.address }, o.address), addressNote: w.addressNote,
      })),
    };
  }

  /**
   * The sessions of an ACTIVE workshop that a guest can see: RUNNING ones (bookable, or not yet / no more, with the reason) and CLOSED ones (shown dimmed), with the seats left. OPEN and PAUSED
   * sessions are not shown at all (FR-SCHED-02).
   */
  async availability(slug: string, workshopId: string, range: { from?: string | undefined; to?: string | undefined }, now = new Date()) {
    const o = await this.shop(slug);
    const [w] = await this.db.select({ id: workshops.id, status: workshops.status }).from(workshops).where(and(eq(workshops.organizationId, o.id), eq(workshops.id, workshopId))).limit(1);
    if (!w || w.status !== "ACTIVE") throw notFound();
    const from = range.from ? new Date(range.from) : now;
    const to = range.to ? new Date(range.to) : new Date(now.getTime() + 90 * 86_400_000);
    const rows = await this.db.select().from(workshopSessions).where(and(
      eq(workshopSessions.organizationId, o.id), eq(workshopSessions.workshopId, workshopId), inArray(workshopSessions.status, ["RUNNING", "CLOSED"]),
      gte(workshopSessions.endsAt, from), lte(workshopSessions.startsAt, to),
    )).orderBy(asc(workshopSessions.startsAt)).limit(500);
    return {
      timezone: o.timezone,
      items: rows.map((s) => {
        const remaining = Math.max(0, s.capacity - s.reservedCount);
        const cutoffAt = s.startsAt.getTime() - s.bookingCutoffMinutes * 60_000;
        const reason = s.status === "CLOSED" ? "CLOSED" : s.startsAt.getTime() <= now.getTime() ? "STARTED" : cutoffAt <= now.getTime() ? "BOOKING_CLOSED" : remaining === 0 ? "SOLD_OUT" : null;
        return { id: s.id, code: s.code, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), date: dateIn(s.startsAt, o.timezone), remaining, capacity: s.capacity, bookingCutoffMinutes: s.bookingCutoffMinutes, imageUrl: s.imageUrl, bookable: reason === null, reason };
      }),
    };
  }

  /** What is stored for a code: a keyed hash (the pepper is `APP_SECRET`), so a copy of the database alone cannot be used to try the 1,000,000 codes. */
  private hashOtp(id: string, code: string): string {
    return this.secrets.hmac("otp", `${id}:${code}`);
  }

  // ---- the code sent by email -------------------------------------------------------------------------------------------------------------------------------

  /** Step 5 of the booking form: a 6-digit code goes to the email of the guest. Always answers the same, whatever the email. */
  async requestOtp(slug: string, email: string, turnstileToken: string | undefined, client: PublicClient, now = new Date()): Promise<void> {
    const o = await this.shop(slug);
    const ipKey = client.ip ?? "unknown";
    const wait = Math.max(this.otpByIp.retryAfter(ipKey), this.otpByEmail.retryAfter(`${o.id}|${email}`));
    if (wait > 0) throw throttled(wait);
    const [last] = await this.db.select({ createdAt: bookingOtps.createdAt }).from(bookingOtps).where(and(eq(bookingOtps.organizationId, o.id), eq(bookingOtps.email, email))).orderBy(desc(bookingOtps.createdAt)).limit(1);
    if (last && now.getTime() - last.createdAt.getTime() < OTP_COOLDOWN_MS) throw throttled(Math.ceil((OTP_COOLDOWN_MS - (now.getTime() - last.createdAt.getTime())) / 1000));
    if (!(await this.turnstile.verify(turnstileToken, client.ip))) throw new BadRequestException({ code: "BOT_CHECK_FAILED", message: "We could not check that you are a person. Please try again." });
    this.otpByIp.hit(ipKey);
    this.otpByEmail.hit(`${o.id}|${email}`);

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await this.db.transaction(async (tx) => {
      const [row] = await tx.insert(bookingOtps).values({ organizationId: o.id, email, codeHash: "pending", expiresAt: new Date(now.getTime() + OTP_MINUTES * 60_000) }).returning({ id: bookingOtps.id });
      await tx.update(bookingOtps).set({ codeHash: this.hashOtp(row!.id, code) }).where(eq(bookingOtps.id, row!.id)); // only the hash of the code is kept
      await this.outbox.enqueueEmail(tx, { name: "booking-otp", to: email, data: { code, minutes: OTP_MINUTES, shop: o.name } }, o.id);
    });
    void this.outbox.wake();
  }

  /**
   * Checks the code. A wrong code is counted (in its own committed step, so the count survives the refusal): after 5 wrong tries the code is dead and a new one must be asked for. Returns the
   * id of the code, which the booking then uses up in its own transaction.
   */
  private async checkOtp(orgId: string, email: string, code: string, now: Date): Promise<string> {
    const outcome = await this.db.transaction(async (tx) => {
      const [otp] = await tx.select().from(bookingOtps).where(and(eq(bookingOtps.organizationId, orgId), eq(bookingOtps.email, email), isNull(bookingOtps.usedAt), gt(bookingOtps.expiresAt, now))).orderBy(desc(bookingOtps.createdAt)).limit(1).for("update");
      if (!otp) return { kind: "invalid" as const, left: 0 };
      if (otp.attempts >= OTP_MAX_TRIES) return { kind: "locked" as const };
      if (safeEqual(otp.codeHash, this.hashOtp(otp.id, code))) return { kind: "ok" as const, id: otp.id };
      await tx.update(bookingOtps).set({ attempts: otp.attempts + 1 }).where(eq(bookingOtps.id, otp.id));
      return { kind: "invalid" as const, left: OTP_MAX_TRIES - otp.attempts - 1 };
    });
    if (outcome.kind === "ok") return outcome.id;
    if (outcome.kind === "locked") throw new HttpException({ code: "OTP_LOCKED", message: "Too many wrong codes. Please ask for a new code.", details: {} }, 429);
    throw new UnprocessableEntityException({ code: "OTP_INVALID", message: "The code is not right or has expired.", details: { fields: { otp: "invalid" }, attemptsLeft: outcome.left } });
  }

  // ---- the booking ---------------------------------------------------------------------------------------------------------------------------------------------

  private mailData(o: OrgRow, b: { bookingCode: string; quantity: number; totalAmount: number; currency: string; snapshot: BookingRow["snapshot"] }): BookingMailData {
    const when = new Intl.DateTimeFormat("en-GB", { timeZone: b.snapshot.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(b.snapshot.startsAt));
    return { shop: o.name, code: b.bookingCode, workshop: b.snapshot.workshopTitle[o.defaultLocale] ?? Object.values(b.snapshot.workshopTitle)[0] ?? "", when, timezone: b.snapshot.timezone, quantity: b.quantity, total: formatMoney(b.totalAmount, b.currency, "en"), address: b.snapshot.address };
  }

  private view(b: BookingRow, now: Date, session?: { status: string; startsAt: Date }): PublicBooking {
    const closed = session ? session.status === "CLOSED" || session.status === "COMPLETED" : false;
    const started = session ? session.startsAt.getTime() <= now.getTime() : true;
    const can = canTransition({ status: b.status, quantity: b.quantity, ...(b.statusBeforeCheckIn ? { statusBeforeCheckIn: b.statusBeforeCheckIn as "NOT_CONFIRMED" | "CONFIRMED" } : {}) }, { startsAt: b.snapshot.startsAt, endsAt: b.snapshot.endsAt, status: (session?.status ?? "CLOSED") as "OPEN", capacity: 0, reservedCount: 0 }, now);
    return {
      code: b.bookingCode, status: b.status, quantity: b.quantity, totalAmount: b.totalAmount, currency: b.currency, guestName: b.guestName, workshopTitle: b.snapshot.workshopTitle,
      startsAt: b.snapshot.startsAt, endsAt: b.snapshot.endsAt, timezone: b.snapshot.timezone, address: b.snapshot.address, cancelReason: b.cancelReason, cancelledBy: b.cancelledBy,
      canCancel: can.CANCEL.allowed && !closed && !started,
    };
  }

  /**
   * FR-BOOK-02. 201 with the booking, or 200 with the same booking when the Idempotency-Key was used before. The order matters: (1) a replay is answered before anything is checked again (the code
   * of the guest is already used up), (2) the code is checked in its own step, (3) the seats, the price, the customer, the booking, the link and the emails are ONE transaction.
   */
  async createBooking(slug: string, input: BookingCreateInput, key: string, client: PublicClient, now = new Date()): Promise<{ booking: PublicBooking; replay: boolean }> {
    const o = await this.shop(slug);
    const email = input.guest.email;
    const replay = await this.findByKey(o.id, key);
    if (replay) return { booking: await this.viewOf(replay, now), replay: true };

    const ipKey = client.ip ?? "unknown";
    const wait = this.creates.retryAfter(ipKey);
    if (wait > 0) throw throttled(wait);
    if (!(await this.turnstile.verify(input.turnstileToken, client.ip))) throw new BadRequestException({ code: "BOT_CHECK_FAILED", message: "We could not check that you are a person. Please try again." });
    this.creates.hit(ipKey);

    const [row] = await this.db
      .select({ session: workshopSessions, workshop: workshops })
      .from(workshopSessions)
      .innerJoin(workshops, and(eq(workshops.organizationId, workshopSessions.organizationId), eq(workshops.id, workshopSessions.workshopId)))
      .where(and(eq(workshopSessions.organizationId, o.id), eq(workshopSessions.id, input.sessionId))).limit(1);
    if (!row || row.workshop.status !== "ACTIVE") throw fields({ sessionId: "unknown" }); // a session of another shop looks like none
    if (input.quantity > row.workshop.maxPerBooking) throw fields({ quantity: "quantityRange" });

    // The price is the SERVER's (BR-04): the unit price of the workshop x the guests, less the promotions the guest chose that run today for this workshop and may be used together. A promotion that
    // does not run (any more) or cannot be combined is refused, never quietly dropped: the guest must know what they will pay.
    const unit = row.workshop.priceAmount;
    const chosenIds = [...new Set(input.promotionIds ?? [])];
    const today = dateIn(now, o.timezone);
    const eligible = chosenIds.length > 0 ? eligiblePromotions(await this.promotions.activeFor(this.db, o.id, today), row.workshop.id, today) : [];
    const chosen = chosenIds.map((id) => eligible.find((p) => p.id === id));
    if (chosen.some((c) => !c)) throw fields({ promotionIds: "unavailable" });
    const priced = priceBooking({ unitPrice: unit, quantity: input.quantity, promotions: chosen.map((c) => c!) });
    if (!priced.ok) throw fields({ promotionIds: "notCombinable" });
    const codeOf = new Map(chosen.map((c) => [c!.id, c!.code]));

    let otpId: string;
    try {
      otpId = await this.checkOtp(o.id, email, input.otp, now);
    } catch (error) {
      // The same request twice at once: the first one has used the code up by now and has made the booking, so the second one is answered with it.
      const done = await this.findByKey(o.id, key);
      if (done) return { booking: await this.viewOf(done, now), replay: true };
      throw error;
    }
    try {
      const result = await this.db.transaction(async (tx) => {
        // Two requests with the same key take turns: the second one waits here, then finds the booking of the first and returns it.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${o.id}:${key}`}))`);
        const [same] = await tx.select().from(bookings).where(and(eq(bookings.organizationId, o.id), eq(bookings.idempotencyKey, key))).limit(1);
        if (same) return { booking: same, replay: true as const };
        const used = await tx.update(bookingOtps).set({ usedAt: now }).where(and(eq(bookingOtps.id, otpId), isNull(bookingOtps.usedAt))).returning({ id: bookingOtps.id });
        if (used.length === 0) throw new UnprocessableEntityException({ code: "OTP_INVALID", message: "The code is not right or has expired.", details: { fields: { otp: "invalid" } } });

        // The row lock, the checks (RUNNING, cut-off, seats) and the new count: one place, SessionCapacityService.
        const { session, bookingNumber } = await this.capacity.reserve(tx, { organizationId: o.id, sessionId: input.sessionId, quantity: input.quantity, online: true, now });

        const customerId = await this.customerFor(tx, o.id, input, now);
        const affiliateLinkId = await affiliateLinkFor(tx, { code: input.ref, organizationId: o.id, workshopId: session.workshopId, guestEmail: email }); // a wrong code only means no link
        const snapshot = { workshopTitle: row.workshop.title, sessionCode: session.code, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), timezone: o.timezone, address: workshopAddress({ address: row.workshop.address }, o.address), subtotalAmount: priced.subtotal, ...(priced.discounts.length > 0 ? { discounts: priced.discounts.map((d) => ({ code: codeOf.get(d.id) ?? "", amount: d.amount, promotionId: d.id })) } : {}) };
        const [booking] = await tx.insert(bookings).values({
          organizationId: o.id, bookingCode: `${session.code}-${String(bookingNumber).padStart(3, "0")}`, sessionId: session.id, workshopId: session.workshopId, customerId, source: "ONLINE", quantity: input.quantity,
          unitPriceAmount: unit, totalAmount: priced.total, discountAmount: priced.discount, promotionIds: priced.discounts.map((d) => d.id), currency: row.workshop.currency, // the price of the SERVER, never one from the client (BR-04)
          guestName: input.guest.fullName, guestEmail: email, guestPhone: input.guest.phone, guestCountry: input.guest.country, snapshot, locale: input.locale,
          specialRequest: input.guest.specialRequest || null, idempotencyKey: key, affiliateLinkId,
        }).returning();
        if (!booking) throw new Error("The booking was not created");

        const token = newToken();
        await tx.insert(bookingConfirmations).values({ organizationId: o.id, bookingId: booking.id, tokenHash: hashToken(token), expiresAt: new Date(now.getTime() + CONFIRM_DAYS * 86_400_000) });
        const mail = this.mailData(o, booking);
        await this.outbox.enqueueEmail(tx, { name: "booking-created", to: email, data: { ...mail, name: input.guest.fullName, confirmLink: `${shopOrigin(this.env, o.slug)}/booking/confirm/${token}` } }, o.id);
        await this.outbox.enqueueEmail(tx, { name: "booking-notice", to: o.contactEmail, data: { ...mail, guestName: input.guest.fullName, guestEmail: email, guestPhone: input.guest.phone, request: input.guest.specialRequest ?? "" } }, o.id);
        await this.audit.record({ organizationId: o.id, action: "booking.create", entityType: "booking", entityId: booking.id, after: { code: booking.bookingCode, quantity: booking.quantity, totalAmount: booking.totalAmount, source: "ONLINE" }, ip: client.ip }, tx);
        return { booking, replay: false as const };
      });
      if (!result.replay) void this.outbox.wake();
      return { booking: await this.viewOf(result.booking, now), replay: result.replay };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const again = await this.findByKey(o.id, key); // two requests with the same key at once: the second gets the booking of the first
        if (again) return { booking: await this.viewOf(again, now), replay: true };
      }
      throw error;
    }
  }

  private async findByKey(orgId: string, key: string): Promise<BookingRow | undefined> {
    const [b] = await this.db.select().from(bookings).where(and(eq(bookings.organizationId, orgId), eq(bookings.idempotencyKey, key))).limit(1);
    return b;
  }

  private async viewOf(b: BookingRow, now: Date): Promise<PublicBooking> {
    const [s] = await this.db.select({ status: workshopSessions.status, startsAt: workshopSessions.startsAt }).from(workshopSessions).where(and(eq(workshopSessions.organizationId, b.organizationId), eq(workshopSessions.id, b.sessionId))).limit(1);
    return this.view(b, now, s);
  }

  /** BR-10: the customer of an email in this shop (made when it is the first booking of that email); an existing customer is NOT overwritten. */
  private async customerFor(tx: Executor, orgId: string, input: BookingCreateInput, now: Date): Promise<string> {
    const email = input.guest.email;
    const find = async () => (await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.organizationId, orgId), eq(customers.emailNormalized, email))).limit(1))[0]?.id;
    const existing = await find();
    if (existing) return existing;
    const [made] = await tx.insert(customers).values({ organizationId: orgId, emailNormalized: email, fullName: input.guest.fullName, country: input.guest.country, phone: input.guest.phone, preferredLocale: input.locale, createdAt: now, updatedAt: now }).onConflictDoNothing().returning({ id: customers.id });
    return made?.id ?? (await find()) ?? (() => { throw new Error("The customer was not created"); })();
  }

  // ---- confirm, look up, cancel -----------------------------------------------------------------------------------------------------------------------

  /** The guest opens the link of the email: NOT_CONFIRMED becomes CONFIRMED. Opening it again changes nothing; a cancelled booking cannot be confirmed. */
  async confirm(token: string, client: PublicClient, now = new Date()): Promise<{ code: string; status: BookingRow["status"]; changed: boolean }> {
    const key = client.ip ?? "unknown";
    const wait = this.lookups.retryAfter(key);
    if (wait > 0) throw throttled(wait);
    this.lookups.hit(key);
    return this.db.transaction(async (tx) => {
      const [conf] = await tx.select().from(bookingConfirmations).where(eq(bookingConfirmations.tokenHash, hashToken(token))).limit(1).for("update");
      if (!conf || conf.expiresAt.getTime() <= now.getTime()) throw new BadRequestException({ code: "TOKEN_INVALID", message: "This link is not valid any more." });
      const [b] = await tx.select().from(bookings).where(and(eq(bookings.organizationId, conf.organizationId), eq(bookings.id, conf.bookingId))).limit(1).for("update");
      if (!b) throw new BadRequestException({ code: "TOKEN_INVALID", message: "This link is not valid any more." });
      if (b.status === "CANCELLED") throw new ConflictException({ code: "BOOKING_CANCELLED", message: "This booking was cancelled, so it cannot be confirmed." });
      const next = confirmation({ status: b.status, ...(b.statusBeforeCheckIn ? { statusBeforeCheckIn: b.statusBeforeCheckIn as "NOT_CONFIRMED" | "CONFIRMED" } : {}) });
      if (!next) return { code: b.bookingCode, status: b.status, changed: false }; // already confirmed: nothing changes
      await tx.update(bookings).set({ status: next.status, statusBeforeCheckIn: next.statusBeforeCheckIn ?? null, statusChangedAt: now, updatedAt: now }).where(and(eq(bookings.organizationId, b.organizationId), eq(bookings.id, b.id)));
      if (!conf.usedAt) await tx.update(bookingConfirmations).set({ usedAt: now }).where(eq(bookingConfirmations.id, conf.id));
      await this.audit.record({ organizationId: b.organizationId, action: "booking.confirm", entityType: "booking", entityId: b.id, before: { status: b.status }, after: { status: next.status }, ip: client.ip }, tx);
      return { code: b.bookingCode, status: next.status, changed: true };
    });
  }

  /** The booking of a code AND an email: a wrong code and a wrong email are the same 404 (no way to learn which booking codes exist). */
  private async findGuestBooking(tx: Executor, o: OrgRow, code: string, email: string, lock = false): Promise<BookingRow> {
    const query = tx.select().from(bookings).where(and(eq(bookings.organizationId, o.id), eq(bookings.bookingCode, code), eq(bookings.guestEmail, email))).limit(1);
    const [b] = lock ? await query.for("update") : await query;
    if (!b) throw notFound();
    return b;
  }

  async lookup(slug: string, code: string, email: string, client: PublicClient, now = new Date()): Promise<PublicBooking> {
    const o = await this.shop(slug);
    const key = client.ip ?? "unknown";
    const wait = this.lookups.retryAfter(key);
    if (wait > 0) throw throttled(wait);
    this.lookups.hit(key);
    return this.viewOf(await this.findGuestBooking(this.db, o, code, email), now);
  }

  /** The guest cancels: only a NOT_CONFIRMED or CONFIRMED booking, before its session starts and while it is not closed (`409 NOT_CANCELLABLE`). The seats come back at once. */
  async cancel(slug: string, input: { code: string; email: string; reason?: string | undefined }, client: PublicClient, now = new Date()): Promise<PublicBooking> {
    const o = await this.shop(slug);
    const key = client.ip ?? "unknown";
    const wait = this.lookups.retryAfter(key);
    if (wait > 0) throw throttled(wait);
    this.lookups.hit(key);
    const result = await this.db.transaction(async (tx) => {
      const b = await this.findGuestBooking(tx, o, input.code, input.email, true);
      const [s] = await tx.select({ status: workshopSessions.status, startsAt: workshopSessions.startsAt }).from(workshopSessions).where(and(eq(workshopSessions.organizationId, o.id), eq(workshopSessions.id, b.sessionId))).limit(1);
      if (!this.view(b, now, s).canCancel) throw new ConflictException({ code: "NOT_CANCELLABLE", message: "This booking cannot be cancelled here. Please contact the studio." });
      await this.capacity.release(tx, { organizationId: o.id, sessionId: b.sessionId, quantity: b.quantity, now });
      const [row] = await tx.update(bookings).set({ status: "CANCELLED", cancelledBy: "GUEST", cancelReason: input.reason || null, statusChangedAt: now, updatedAt: now }).where(and(eq(bookings.organizationId, o.id), eq(bookings.id, b.id))).returning();
      if (!row) throw notFound();
      const mail = this.mailData(o, row);
      await this.outbox.enqueueEmail(tx, { name: "booking-cancelled-guest", to: input.email, data: { ...mail, name: row.guestName, by: "GUEST", reason: input.reason ?? "" } }, o.id);
      await this.outbox.enqueueEmail(tx, { name: "booking-cancelled-shop", to: o.contactEmail, data: { ...mail, guestName: row.guestName, reason: input.reason ?? "" } }, o.id);
      await this.audit.record({ organizationId: o.id, action: "booking.cancel_by_guest", entityType: "booking", entityId: b.id, before: { status: b.status }, after: { status: "CANCELLED" }, ip: client.ip }, tx);
      return row;
    });
    void this.outbox.wake();
    return this.viewOf(result, now);
  }
}
