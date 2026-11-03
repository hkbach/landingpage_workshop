// SERVER-ONLY: the bookings as the mock backend knows them, until apps/api exists. The demo rows, plus the bookings guests make on the landing page
// (they start NOT_CONFIRMED and become CONFIRMED when the guest opens the link of the email), plus the status changes the ops screens make (cancel,
// check-in, ...: they are sent here so they survive a reload and the promotion rules can see them). Lives on globalThis like the other mock stores.
import { eligiblePromotions, isSessionFinished, nextBookingCode, priceBooking, type BookingStatus, type BookingUse } from "@workshop/shared";
import { computePaymentStatus, confirmation, netPaid, reservedSeats, type PreCheckInStatus } from "@/lib/booking-state";
import type { Booking, Customer, PaymentEntry } from "@/lib/types";
import { newUuid } from "@/lib/uuid";
import { bookings as seed, currentShop, customers as seedCustomers, sessions, workshops } from "./data";
import { queueBookingConfirmation } from "./outbox-store";
import { allPromotions, shopToday } from "./promotion-store";

interface Change { status: BookingStatus; cancelReason?: string; checkedInAt?: string; statusBeforeCheckIn?: PreCheckInStatus }
interface Store {
  changes: Map<string, Change>;
  /** Bookings guests made on the landing page, and the customers they created. */
  made: Booking[];
  madeCustomers: Customer[];
  /** The secret of the confirmation link -> the booking it confirms. */
  tokens: Map<string, string>;
  /** Idempotency-Key -> the booking it made, so a repeated request gives the same booking (FR-BOOK-02). */
  keys: Map<string, string>;
  /** The payments and refunds the shop recorded after the session (Confirm payment / Unpaid), added to the ones the booking already has. */
  extra: Map<string, PaymentEntry[]>;
}
const g = globalThis as unknown as { __bookingStore?: Store };
const store = (): Store => {
  const st = (g.__bookingStore ??= { changes: new Map(), made: [], madeCustomers: [], tokens: new Map(), keys: new Map(), extra: new Map() });
  st.extra ??= new Map(); // a store made before this field existed (a dev server that reloaded its code)
  return st;
};
const changes = () => store().changes;
const allRows = (): Booking[] => [...seed, ...store().made];

/** Test helper: back to the demo rows. */
export function resetBookingStore(): void {
  g.__bookingStore = undefined;
}

/** Test helper: every booking is cancelled, so no promotion is in use and any promotion can be paused. */
export function releaseAllBookings(): void {
  for (const b of allRows()) changes().set(b.id, { status: "CANCELLED" });
}

const isOpen = (s: BookingStatus): s is PreCheckInStatus => s === "NOT_CONFIRMED" || s === "CONFIRMED";

/** Every booking with its current status. */
export function liveBookings(): Booking[] {
  return allRows().map((b) => {
    const c = changes().get(b.id);
    const { statusBeforeCheckIn: _was, ...rest } = b;
    void _was;
    const status = c?.status ?? b.status;
    // The status before a check-in is only kept while the booking is checked in (CONFIRMED when it was never recorded).
    const before = status === "CHECKED_IN" ? (c?.statusBeforeCheckIn ?? b.statusBeforeCheckIn ?? "CONFIRMED") : undefined;
    const extra = store().extra.get(b.id);
    const payments = extra ? [...b.payments, ...extra] : b.payments;
    return {
      ...rest, payments, paymentStatus: extra ? computePaymentStatus(b.totalAmount, payments) : b.paymentStatus, status, ...(c ? { cancelReason: c.cancelReason ?? b.cancelReason, checkedInAt: c.checkedInAt } : {}), ...(before ? { statusBeforeCheckIn: before } : {}),
    };
  });
}

/**
 * The shop sets a booking Paid or Unpaid after the session. Paid records the missing amount as a cash payment; Unpaid gives back what was paid as a
 * refund entry (entries are only added, never changed). False when the booking does not exist or has nothing to pay. TODO(api): in the transaction
 * of the endpoint, with the audit log.
 */
export function recordPaid(id: string, paid: boolean, by: string, now: Date = new Date()): boolean {
  const b = liveBookings().find((x) => x.id === id);
  if (!b || b.totalAmount <= 0) return false;
  const net = netPaid(b.payments);
  if (paid ? b.paymentStatus === "PAID" : b.paymentStatus === "UNPAID") return true;
  const entry: PaymentEntry = {
    id: `pm-srv-${newUuid()}`, type: paid ? "PAYMENT" : "REFUND", amount: paid ? b.totalAmount - Math.max(0, net) : net, method: "CASH",
    note: paid ? "Payment confirmed after the session" : "Marked as unpaid", recordedAt: now.toISOString(), recordedBy: by,
  };
  store().extra.set(id, [...(store().extra.get(id) ?? []), entry]);
  return true;
}

/** The customers of the shop: the demo ones, and the ones guests became by booking. */
export const liveCustomers = (): Customer[] => [...seedCustomers, ...store().madeCustomers];

/**
 * Records a status change of a booking; false when the booking does not exist. A check-in remembers the status the booking had (`before`, or the
 * one it has now when it is not given) so an uncheck-in goes back to it.
 */
export function setBookingStatus(id: string, status: BookingStatus, cancelReason?: string, checkedInAt?: string, before?: PreCheckInStatus): boolean {
  const base = allRows().find((b) => b.id === id);
  if (!base) return false;
  const now = liveBookings().find((b) => b.id === id)!;
  // The time of the check-in is kept while the booking is checked in; any other status (an uncheck-in, a cancel) drops it.
  const keep = status === "CHECKED_IN" ? (checkedInAt ?? now.checkedInAt) : undefined;
  const wasBefore = status === "CHECKED_IN" ? (before ?? (isOpen(now.status) ? now.status : now.statusBeforeCheckIn) ?? "CONFIRMED") : undefined;
  changes().set(id, { status, ...(cancelReason ? { cancelReason } : {}), ...(keep ? { checkedInAt: keep } : {}), ...(wasBefore ? { statusBeforeCheckIn: wasBefore } : {}) });
  return true;
}

// ---- a guest books on the landing page ---------------------------------------------------------------------------------------------

export interface GuestBookingInput {
  sessionId: string; quantity: number; fullName: string; email: string; phone?: string; specialRequest?: string;
  promotionIds?: readonly string[]; locale?: Customer["preferredLocale"];
}
export type GuestBookingResult =
  | { ok: true; booking: Booking; confirmToken: string; repeated: boolean }
  | { ok: false; code: "UNKNOWN_SESSION" | "SESSION_CLOSED" | "QUANTITY" | "SESSION_FULL" | "NOT_COMBINABLE" };

/**
 * A guest makes a booking: it is NOT_CONFIRMED, and an email with the link that confirms it is queued for the guest. The server checks the session and
 * the seats left and works the price out itself (nothing about price, status or the shop comes from the browser). The customer is found by email, or
 * created without an account (BR-10). A repeated Idempotency-Key gives the booking it already made.
 */
export function createGuestBooking(input: GuestBookingInput, confirmUrlFor: (token: string) => string, idempotencyKey?: string, now: Date = new Date()): GuestBookingResult {
  if (idempotencyKey) {
    const id = store().keys.get(idempotencyKey);
    const again = id ? liveBookings().find((b) => b.id === id) : undefined;
    if (again) return { ok: true, booking: again, confirmToken: [...store().tokens].find(([, v]) => v === again.id)?.[0] ?? "", repeated: true };
  }
  const session = sessions.find((s) => s.id === input.sessionId);
  const workshop = session && workshops.find((w) => w.id === session.workshopId);
  if (!session || !workshop) return { ok: false, code: "UNKNOWN_SESSION" };
  if (isSessionFinished(session.status) || Date.parse(session.endsAt) <= now.getTime()) return { ok: false, code: "SESSION_CLOSED" };
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > workshop.maxPerBooking) return { ok: false, code: "QUANTITY" };
  const live = liveBookings();
  // The seats left (SessionCapacityService in the real backend: the check and the booking are one locked step).
  if (reservedSeats(live, session.id) + input.quantity > session.capacity) return { ok: false, code: "SESSION_FULL" };

  // The price is the server's: only promotions that are active today and apply to the workshop count.
  const allowed = new Set(eligiblePromotions(allPromotions(), workshop.id, shopToday()).map((p) => p.id));
  const used = allPromotions().filter((p) => (input.promotionIds ?? []).includes(p.id) && allowed.has(p.id));
  const priced = priceBooking({ unitPrice: workshop.priceAmount, quantity: input.quantity, promotions: used });
  if (!priced.ok) return { ok: false, code: "NOT_COMBINABLE" };

  const email = input.email.trim().toLowerCase();
  let customer = liveCustomers().find((c) => c.email?.trim().toLowerCase() === email);
  if (!customer) {
    customer = { id: `cu-${newUuid().slice(0, 8)}`, fullName: input.fullName.trim(), email, ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}), preferredLocale: input.locale ?? currentShop.defaultLocale };
    store().madeCustomers.push(customer);
  }
  const booking: Booking = {
    id: `bk-${newUuid().slice(0, 8)}`, bookingCode: nextBookingCode(session.code, live.map((b) => b.bookingCode)), sessionId: session.id, workshopId: workshop.id,
    customerId: customer.id, source: "ONLINE", quantity: input.quantity, status: "NOT_CONFIRMED", paymentStatus: "UNPAID", unitPriceAmount: workshop.priceAmount,
    totalAmount: priced.total, currency: workshop.currency, workshopTitle: workshop.title.en ?? "", startsAt: session.startsAt, endsAt: session.endsAt,
    timezone: currentShop.timezone, createdAt: now.toISOString(), payments: [],
    ...(input.specialRequest?.trim() ? { specialRequest: input.specialRequest.trim() } : {}),
    ...(used.length ? { promotionIds: used.map((p) => p.id), discountAmount: priced.discount } : {}),
  };
  store().made.push(booking);
  const token = newUuid();
  store().tokens.set(token, booking.id);
  if (idempotencyKey) store().keys.set(idempotencyKey, booking.id);
  // The email goes to the person who booked, in their language, with the booking and the link that confirms it.
  queueBookingConfirmation({
    to: email, locale: customer.preferredLocale, guestName: customer.fullName, shopName: currentShop.name, bookingCode: booking.bookingCode, workshopTitle: booking.workshopTitle, timezone: booking.timezone,
    startsAt: booking.startsAt, endsAt: booking.endsAt, quantity: booking.quantity, totalAmount: booking.totalAmount, currency: booking.currency, confirmUrl: confirmUrlFor(token),
  });
  return { ok: true, booking, confirmToken: token, repeated: false };
}

export type ConfirmResult =
  | { ok: true; booking: Booking; already: boolean }
  | { ok: false; code: "INVALID" | "CANCELLED" };

/** The guest opened the link of the email: a NOT_CONFIRMED booking becomes CONFIRMED. Opening it again changes nothing ("already"). */
export function confirmBookingByToken(token: string): ConfirmResult {
  const id = store().tokens.get(token);
  const current = id ? liveBookings().find((b) => b.id === id) : undefined;
  if (!id || !current) return { ok: false, code: "INVALID" };
  if (current.status === "CANCELLED") return { ok: false, code: "CANCELLED" };
  const next = confirmation(current);
  if (!next) return { ok: true, booking: current, already: true };
  const prev = changes().get(id);
  changes().set(id, { ...(prev ?? {}), ...(current.checkedInAt ? { checkedInAt: current.checkedInAt } : {}), status: next.status, ...(next.statusBeforeCheckIn ? { statusBeforeCheckIn: next.statusBeforeCheckIn } : {}) });
  return { ok: true, booking: liveBookings().find((b) => b.id === id)!, already: false };
}

/** Demo only: the secret of the link of a booking that is not confirmed yet, so the confirmation page can offer it (a real guest only gets it by email). */
export function demoConfirmToken(bookingId: string): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const current = liveBookings().find((b) => b.id === bookingId);
  if (current?.status !== "NOT_CONFIRMED") return undefined;
  return [...store().tokens].find(([, v]) => v === bookingId)?.[0];
}

/** What the pause rule needs about every booking (see bookingsBlockingPause). */
export function bookingUses(): BookingUse[] {
  return liveBookings().flatMap((b) => {
    const s = sessions.find((x) => x.id === b.sessionId);
    return s ? [{ id: b.id, bookingCode: b.bookingCode, status: b.status, promotionIds: b.promotionIds ?? [], sessionEndsAt: s.endsAt, sessionStatus: s.status }] : [];
  });
}

