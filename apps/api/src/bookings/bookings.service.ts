import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { and, asc, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { canTransition, computePaymentStatus, formatMoney, netPaid, targetStatus, workshopAddress, type BookingAction } from "@workshop/shared";
import { AuditService } from "../audit/audit.service";
import type { OrgContext } from "../auth/auth.guards";
import { isUniqueViolation } from "../auth/auth.service";
import { autoCloseEnded } from "../catalog/session-sweeper";
import type { Actor } from "../catalog/workshops.service";
import { decodeCursor, encodeCursor } from "../common/cursor";
import { addDays, zonedToUtc } from "../common/zoned-time";
import { DB, type Database, type Executor } from "../db/db.module";
import { bookings, customers, organizations, payments, workshopSessions, workshops } from "../db/schema";
import type { BookingMailData } from "../email/templates";
import { assertMonthsOpen } from "../finance/ledger";
import { OutboxService } from "../outbox/outbox.service";
import { assertShopWritable } from "../tenant/shop-writable";
import { tenantScope } from "../tenant/tenant-scope";
import { SessionCapacityService } from "./session-capacity.service";

type BookingRow = typeof bookings.$inferSelect;
type PaymentRow = typeof payments.$inferSelect;
type SessionRow = typeof workshopSessions.$inferSelect;

export interface BookingView {
  id: string; code: string; status: BookingRow["status"]; paymentStatus: BookingRow["paymentStatus"]; source: BookingRow["source"]; quantity: number;
  unitPriceAmount: number; totalAmount: number; paidAmount: number; currency: string;
  guest: { name: string; email: string | null; phone: string; country: string }; specialRequest: string | null;
  session: { id: string; code: string; startsAt: string; endsAt: string; status: SessionRow["status"] };
  workshop: { id: string; title: Record<string, string> };
  customerId: string; cancelReason: string | null; cancelledBy: "SHOP" | "GUEST" | null; checkedInAt: string | null; createdAt: string;
  actions: BookingAction[];
}
export interface PaymentView { id: string; type: "PAYMENT" | "REVERSAL"; amount: number; currency: string; method: PaymentRow["method"]; note: string | null; recordedAt: string }

const conflict = (code: string, message: string, details: Record<string, unknown> = {}) => new ConflictException({ code, message, details });
const notFound = () => new NotFoundException({ code: "NOT_FOUND", message: "Booking not found." }); // the same answer for an id that does not exist and one of another shop
const invalid = (fields: Record<string, string>) => new UnprocessableEntityException({ code: "VALIDATION", message: "Please check the highlighted fields.", details: { fields } });
const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);

export interface BookingListQuery { date?: string | undefined; sessionId?: string | undefined; status?: BookingRow["status"] | undefined; paymentStatus?: BookingRow["paymentStatus"] | undefined; q?: string | undefined; limit: number; cursor?: string | undefined }
export interface ManualBookingInput { sessionId: string; quantity: number; source: "WALK_IN" | "PHONE" | "OTHER"; fullName: string; email?: string | undefined; phone?: string | undefined; country?: string | undefined; specialRequest?: string | undefined }

/**
 * What the shop owner does with the bookings of the shop (FR-OPS): list, look at, make one for a guest who walks in or phones, check in and undo it, cancel (with a reason), and record
 * that a booking was paid (or put it back to unpaid). The state machine is the one of `packages/shared` (the web app uses it too). The shop comes from the session, never from the request.
 */
@Injectable()
export class BookingsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboxService) private readonly outbox: OutboxService,
    @Inject(SessionCapacityService) private readonly capacity: SessionCapacityService,
  ) {}

  // ---- reading ---------------------------------------------------------------------------------------------------------------------------------------------

  private actionsOf(b: BookingRow, s: SessionRow, now: Date): BookingAction[] {
    const states = canTransition({ status: b.status, quantity: b.quantity, ...(b.statusBeforeCheckIn ? { statusBeforeCheckIn: b.statusBeforeCheckIn as "NOT_CONFIRMED" | "CONFIRMED" } : {}) }, { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), status: s.status, capacity: s.capacity, reservedCount: s.reservedCount }, now);
    return (Object.keys(states) as BookingAction[]).filter((a) => states[a].allowed && a !== "RESCHEDULE");
  }

  private toView(b: BookingRow, s: SessionRow, title: Record<string, string>, paid: number, now: Date): BookingView {
    return {
      id: b.id, code: b.bookingCode, status: b.status, paymentStatus: b.paymentStatus, source: b.source, quantity: b.quantity, unitPriceAmount: b.unitPriceAmount, totalAmount: b.totalAmount, paidAmount: paid, currency: b.currency,
      guest: { name: b.guestName, email: b.guestEmail, phone: b.guestPhone, country: b.guestCountry }, specialRequest: b.specialRequest,
      session: { id: s.id, code: s.code, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), status: s.status }, workshop: { id: b.workshopId, title },
      customerId: b.customerId, cancelReason: b.cancelReason, cancelledBy: b.cancelledBy, checkedInAt: b.checkedInAt?.toISOString() ?? null, createdAt: b.createdAt.toISOString(), actions: this.actionsOf(b, s, now),
    };
  }

  private paidOf = async (executor: Executor, orgId: string, ids: string[]): Promise<Map<string, number>> => {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const rows = await executor.select({ bookingId: payments.bookingId, type: payments.type, n: sql<number>`sum(${payments.amount})::bigint` }).from(payments)
      .where(and(tenantScope(payments, orgId), inArray(payments.bookingId, ids))).groupBy(payments.bookingId, payments.type);
    for (const r of rows) out.set(r.bookingId, (out.get(r.bookingId) ?? 0) + (r.type === "PAYMENT" ? Number(r.n) : -Number(r.n)));
    return out;
  }

  /** The bookings of the shop, newest first, with filters: the day of the SESSION (in the time zone of the shop), one session, a status, and a search of the code, the name, the email and the phone. */
  async list(org: OrgContext, query: BookingListQuery, now = new Date()) {
    await autoCloseEnded(this.db, this.audit, { organizationId: org.id });
    const conditions: (SQL | undefined)[] = [tenantScope(bookings, org.id)];
    if (query.sessionId) conditions.push(eq(bookings.sessionId, query.sessionId));
    if (query.status) conditions.push(eq(bookings.status, query.status));
    if (query.paymentStatus) conditions.push(eq(bookings.paymentStatus, query.paymentStatus));
    if (query.date) {
      const [shop] = await this.db.select({ timezone: organizations.timezone }).from(organizations).where(eq(organizations.id, org.id)).limit(1);
      const from = zonedToUtc(query.date, "00:00", shop?.timezone ?? "UTC") ?? new Date(`${query.date}T00:00:00Z`);
      const to = zonedToUtc(addDays(query.date, 1), "00:00", shop?.timezone ?? "UTC") ?? new Date(`${addDays(query.date, 1)}T00:00:00Z`);
      conditions.push(sql`${bookings.sessionId} in (select id from workshop_sessions where organization_id = ${org.id} and starts_at >= ${from.toISOString()}::timestamptz and starts_at < ${to.toISOString()}::timestamptz)`);
    }
    if (query.q) {
      const like = `%${escapeLike(query.q)}%`;
      conditions.push(or(sql`${bookings.bookingCode} ilike ${like} escape '\\'`, sql`${bookings.guestName} ilike ${like} escape '\\'`, sql`${bookings.guestEmail} ilike ${like} escape '\\'`, sql`${bookings.guestPhone} ilike ${like} escape '\\'`));
    }
    if (query.cursor) {
      const c = decodeCursor<{ t: string; id: string }>(query.cursor, ["t", "id"]);
      const at = new Date(String(c.t));
      if (Number.isNaN(at.getTime())) throw new BadRequestException({ code: "BAD_CURSOR", message: "The cursor is not valid." });
      conditions.push(or(lt(bookings.createdAt, at), and(eq(bookings.createdAt, at), lt(bookings.id, String(c.id)))));
    }
    const rows = await this.db
      .select({ booking: bookings, session: workshopSessions, title: workshops.title })
      .from(bookings)
      .innerJoin(workshopSessions, and(eq(workshopSessions.organizationId, bookings.organizationId), eq(workshopSessions.id, bookings.sessionId)))
      .innerJoin(workshops, and(eq(workshops.organizationId, bookings.organizationId), eq(workshops.id, bookings.workshopId)))
      .where(and(...conditions)).orderBy(desc(bookings.createdAt), desc(bookings.id)).limit(query.limit + 1);
    const page = rows.slice(0, query.limit);
    const paid = await this.paidOf(this.db, org.id, page.map((r) => r.booking.id));
    const last = rows.length > query.limit ? page[page.length - 1] : undefined;
    return { items: page.map((r) => this.toView(r.booking, r.session, r.title, paid.get(r.booking.id) ?? 0, now)), nextCursor: last ? encodeCursor({ t: last.booking.createdAt.toISOString(), id: last.booking.id }) : null };
  }

  private async load(executor: Executor, org: OrgContext, id: string, lock = false) {
    const query = executor
      .select({ booking: bookings, session: workshopSessions, title: workshops.title })
      .from(bookings)
      .innerJoin(workshopSessions, and(eq(workshopSessions.organizationId, bookings.organizationId), eq(workshopSessions.id, bookings.sessionId)))
      .innerJoin(workshops, and(eq(workshops.organizationId, bookings.organizationId), eq(workshops.id, bookings.workshopId)))
      .where(and(tenantScope(bookings, org.id), eq(bookings.id, id))).limit(1);
    const [row] = lock ? await query.for("update", { of: bookings }) : await query;
    if (!row) throw notFound();
    return row;
  }

  async get(org: OrgContext, id: string, now = new Date()): Promise<BookingView & { payments: PaymentView[] }> {
    await autoCloseEnded(this.db, this.audit, { organizationId: org.id });
    const row = await this.load(this.db, org, id);
    const list = await this.db.select().from(payments).where(and(tenantScope(payments, org.id), eq(payments.bookingId, id))).orderBy(asc(payments.recordedAt), asc(payments.id));
    return { ...this.toView(row.booking, row.session, row.title, netPaid(list), now), payments: list.map(paymentView) };
  }

  private async mail(executor: Executor, orgId: string, b: BookingRow, session: SessionRow, title: Record<string, string>): Promise<{ data: BookingMailData; shop: typeof organizations.$inferSelect }> {
    const [shop] = await executor.select().from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!shop) throw notFound();
    const when = new Intl.DateTimeFormat("en-GB", { timeZone: b.snapshot.timezone, dateStyle: "full", timeStyle: "short" }).format(session.startsAt);
    return { shop, data: { shop: shop.name, code: b.bookingCode, workshop: title[shop.defaultLocale] ?? Object.values(title)[0] ?? "", when, timezone: b.snapshot.timezone, quantity: b.quantity, total: formatMoney(b.totalAmount, b.currency, "en"), address: b.snapshot.address } };
  }

  // ---- a booking made by the shop --------------------------------------------------------------------------------------------------------------------------

  /** For a guest who is at the studio or phones. CONFIRMED at once (the shop confirmed it with the guest); the price is the server's; with an email the guest gets the details. */
  async createManual(org: OrgContext, input: ManualBookingInput, key: string, actor: Actor, now = new Date()): Promise<{ booking: BookingView; replay: boolean }> {
    assertShopWritable(org);
    const [same] = await this.db.select({ id: bookings.id }).from(bookings).where(and(tenantScope(bookings, org.id), eq(bookings.idempotencyKey, key))).limit(1);
    if (same) return { booking: await this.get(org, same.id, now), replay: true };
    const email = input.email?.trim().toLowerCase() || undefined;
    try {
      const id = await this.db.transaction(async (tx) => {
        const [row] = await tx.select({ session: workshopSessions, workshop: workshops }).from(workshopSessions)
          .innerJoin(workshops, and(eq(workshops.organizationId, workshopSessions.organizationId), eq(workshops.id, workshopSessions.workshopId)))
          .where(and(tenantScope(workshopSessions, org.id), eq(workshopSessions.id, input.sessionId))).limit(1);
        if (!row) throw invalid({ sessionId: "unknown" });
        if (input.quantity > row.workshop.maxPerBooking) throw invalid({ quantity: "quantityRange" });
        const [shop] = await tx.select().from(organizations).where(eq(organizations.id, org.id)).limit(1);
        const { session, bookingNumber } = await this.capacity.reserve(tx, { organizationId: org.id, sessionId: input.sessionId, quantity: input.quantity, online: false, now });

        let customerId: string | undefined;
        if (email) customerId = (await tx.select({ id: customers.id }).from(customers).where(and(tenantScope(customers, org.id), eq(customers.emailNormalized, email))).limit(1))[0]?.id;
        if (!customerId) {
          const [made] = await tx.insert(customers).values({ organizationId: org.id, emailNormalized: email ?? null, fullName: input.fullName, phone: input.phone ?? "", country: input.country ?? "", createdAt: now, updatedAt: now }).onConflictDoNothing().returning({ id: customers.id });
          customerId = made?.id ?? (await tx.select({ id: customers.id }).from(customers).where(and(tenantScope(customers, org.id), eq(customers.emailNormalized, email ?? ""))).limit(1))[0]?.id;
        }
        if (!customerId) throw new Error("The customer was not created");

        const unit = row.workshop.priceAmount;
        const snapshot = { workshopTitle: row.workshop.title, sessionCode: session.code, startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString(), timezone: shop!.timezone, address: workshopAddress({ address: row.workshop.address }, shop!.address), subtotalAmount: unit * input.quantity };
        const [booking] = await tx.insert(bookings).values({
          organizationId: org.id, bookingCode: `${session.code}-${String(bookingNumber).padStart(3, "0")}`, sessionId: session.id, workshopId: session.workshopId, customerId, source: input.source, quantity: input.quantity,
          status: "CONFIRMED", unitPriceAmount: unit, totalAmount: unit * input.quantity, currency: row.workshop.currency, guestName: input.fullName, guestEmail: email ?? null, guestPhone: input.phone ?? "", guestCountry: input.country ?? "",
          snapshot, locale: shop!.defaultLocale, specialRequest: input.specialRequest || null, idempotencyKey: key, createdBy: actor.userId, statusChangedBy: actor.userId,
        }).returning();
        if (!booking) throw new Error("The booking was not created");
        if (email) {
          const { data } = await this.mail(tx, org.id, booking, session, row.workshop.title);
          await this.outbox.enqueueEmail(tx, { name: "booking-info", to: email, data: { ...data, name: input.fullName } }, org.id);
        }
        await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: "booking.manual_create", entityType: "booking", entityId: booking.id, after: { code: booking.bookingCode, quantity: booking.quantity, source: booking.source }, ip: actor.ip }, tx);
        return booking.id;
      });
      void this.outbox.wake();
      return { booking: await this.get(org, id, now), replay: false };
    } catch (error) {
      if (isUniqueViolation(error)) {
        const [again] = await this.db.select({ id: bookings.id }).from(bookings).where(and(tenantScope(bookings, org.id), eq(bookings.idempotencyKey, key))).limit(1);
        if (again) return { booking: await this.get(org, again.id, now), replay: true };
      }
      throw error;
    }
  }

  // ---- check-in, undo, cancel ------------------------------------------------------------------------------------------------------------------------------

  /** `CHECK_IN | UNDO_CHECK_IN | CANCEL`, each checked by the state machine (BR-11): `409 INVALID_TRANSITION` otherwise. Cancelling needs a reason and gives the seats back. */
  async act(org: OrgContext, id: string, action: Exclude<BookingAction, "RESCHEDULE">, actor: Actor, opts: { reason?: string | undefined } = {}, now = new Date()): Promise<BookingView> {
    assertShopWritable(org);
    if (action === "CANCEL" && !opts.reason) throw invalid({ reason: "required" });
    const result = await this.db.transaction(async (tx) => {
      await autoCloseEnded(tx, this.audit, { organizationId: org.id });
      const { booking: b, session: s, title } = await this.load(tx, org, id, true);
      const states = canTransition({ status: b.status, quantity: b.quantity, ...(b.statusBeforeCheckIn ? { statusBeforeCheckIn: b.statusBeforeCheckIn as "NOT_CONFIRMED" | "CONFIRMED" } : {}) }, { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), status: s.status, capacity: s.capacity, reservedCount: s.reservedCount }, now);
      if (!states[action].allowed) throw conflict("INVALID_TRANSITION", "This change is not allowed for this booking.", { status: b.status, action });
      const to = targetStatus(action, b.statusBeforeCheckIn ? { statusBeforeCheckIn: b.statusBeforeCheckIn as "NOT_CONFIRMED" | "CONFIRMED" } : {})!;
      if (action === "CANCEL") await this.capacity.release(tx, { organizationId: org.id, sessionId: b.sessionId, quantity: b.quantity, now });
      const [row] = await tx.update(bookings).set({
        status: to, statusChangedAt: now, statusChangedBy: actor.userId, updatedAt: now,
        ...(action === "CHECK_IN" ? { statusBeforeCheckIn: b.status as "NOT_CONFIRMED" | "CONFIRMED", checkedInAt: now, checkedInBy: actor.userId } : {}),
        ...(action === "UNDO_CHECK_IN" ? { statusBeforeCheckIn: null, checkedInAt: null, checkedInBy: null } : {}),
        ...(action === "CANCEL" ? { cancelReason: opts.reason ?? null, cancelledBy: "SHOP" as const } : {}),
      }).where(and(tenantScope(bookings, org.id), eq(bookings.id, id))).returning();
      if (!row) throw notFound();
      if (action === "CANCEL" && row.guestEmail) {
        const { data } = await this.mail(tx, org.id, row, s, title);
        await this.outbox.enqueueEmail(tx, { name: "booking-cancelled-guest", to: row.guestEmail, data: { ...data, name: row.guestName, by: "SHOP", reason: opts.reason ?? "" } }, org.id);
      }
      const name = action === "CHECK_IN" ? "booking.check_in" : action === "UNDO_CHECK_IN" ? "booking.undo_check_in" : "booking.cancel_by_shop";
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: name, entityType: "booking", entityId: id, before: { status: b.status }, after: { status: to, ...(opts.reason ? { reason: opts.reason } : {}) }, ip: actor.ip }, tx);
      return { id };
    });
    if (action === "CANCEL") void this.outbox.wake();
    return this.get(org, result.id, now);
  }

  // ---- payments ----------------------------------------------------------------------------------------------------------------------------------------------

  /**
   * Records that the booking was paid (a PAYMENT for what is still owed) or puts it back to unpaid (a REVERSAL of what was paid: not a refund, REQUIREMENTS 8.5). A booking that becomes paid
   * is also checked in (the guest came and paid), and goes back to the status it had when it becomes unpaid. A cancelled booking, one with nothing to pay and one of a COMPLETED session
   * (final) take no payment. D10: a booking with a payment in a month that was closed cannot be put back to unpaid (409 MONTH_CLOSED).
   */
  async setPaid(org: OrgContext, id: string, input: { paid: boolean; method?: PaymentRow["method"] | undefined; note?: string | undefined }, actor: Actor, now = new Date()): Promise<BookingView & { payments: PaymentView[] }> {
    assertShopWritable(org);
    const notify = await this.db.transaction(async (tx) => {
      await autoCloseEnded(tx, this.audit, { organizationId: org.id });
      const { booking: b, session: s, title } = await this.load(tx, org, id, true);
      if (b.status === "CANCELLED" || b.totalAmount <= 0) throw conflict("INVALID_STATE", "This booking takes no payment.");
      if (s.status === "COMPLETED") throw conflict("SESSION_COMPLETED", "The session is completed: its payments no longer change.");
      const entries = await tx.select().from(payments).where(and(tenantScope(payments, org.id), eq(payments.bookingId, id)));
      const net = netPaid(entries);
      if (input.paid ? b.paymentStatus === "PAID" : net <= 0) return false; // nothing changes
      if (!input.paid) await assertMonthsOpen(tx, org.id, entries.filter((e) => e.type === "PAYMENT").map((e) => e.recordedAt)); // D10: a closed month is final
      const amount = input.paid ? b.totalAmount - Math.max(0, net) : net;
      const [entry] = await tx.insert(payments).values({
        organizationId: org.id, bookingId: id, type: input.paid ? "PAYMENT" : "REVERSAL", amount, currency: b.currency, method: input.method ?? "CASH",
        note: input.note || (input.paid ? "Payment confirmed" : "Marked as unpaid"), recordedBy: actor.userId, recordedAt: now,
      }).returning();
      if (!entry) throw new Error("The payment was not recorded");
      const paymentStatus = computePaymentStatus(b.totalAmount, [...entries, entry]);
      const open = b.status === "NOT_CONFIRMED" || b.status === "CONFIRMED";
      await tx.update(bookings).set({
        paymentStatus, updatedAt: now,
        ...(input.paid && open ? { status: "CHECKED_IN" as const, statusBeforeCheckIn: b.status, checkedInAt: now, checkedInBy: actor.userId, statusChangedAt: now, statusChangedBy: actor.userId } : {}),
        ...(!input.paid && b.status === "CHECKED_IN" ? { status: (b.statusBeforeCheckIn ?? "CONFIRMED") as "NOT_CONFIRMED" | "CONFIRMED", statusBeforeCheckIn: null, checkedInAt: null, checkedInBy: null, statusChangedAt: now, statusChangedBy: actor.userId } : {}),
      }).where(and(tenantScope(bookings, org.id), eq(bookings.id, id)));
      await this.audit.record({ organizationId: org.id, actorUserId: actor.userId, action: input.paid ? "booking.mark_paid" : "booking.mark_unpaid", entityType: "booking", entityId: id, after: { amount, method: entry.method, paymentStatus }, ip: actor.ip }, tx);
      if (input.paid && b.guestEmail) {
        const { data } = await this.mail(tx, org.id, b, s, title);
        await this.outbox.enqueueEmail(tx, { name: "payment-received", to: b.guestEmail, data: { ...data, name: b.guestName, paid: formatMoney(amount, b.currency, "en") } }, org.id);
        return true;
      }
      return false;
    });
    if (notify) void this.outbox.wake();
    return this.get(org, id, now);
  }
}

function paymentView(p: PaymentRow): PaymentView {
  return { id: p.id, type: p.type, amount: p.amount, currency: p.currency, method: p.method, note: p.note, recordedAt: p.recordedAt.toISOString() };
}

