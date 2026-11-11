// SERVER-ONLY: the bookings as the mock backend knows them, until apps/api exists. The demo rows, plus the bookings guests make on the landing page
// (they start NOT_CONFIRMED and become CONFIRMED when the guest opens the link of the email), plus the status changes the ops screens make (cancel,
// check-in, ...: they are sent here so they survive a reload and the promotion rules can see them). Lives on globalThis like the other mock stores.
import { closeIfEnded, eligiblePromotions, pickLocalized, isSessionBookable, isSessionFinished, nextBookingCode, priceBooking, socialEntries, type BookingStatus, type BookingUse, type Gender, type Socials, type WorkshopCategory, ownAddressNote, workshopAddress } from "@workshop/shared";
import { CHECKIN_OPENS_MINUTES } from "@/lib/customer-bookings";
import { computePaymentStatus, confirmation, netPaid, reservedSeats, type PreCheckInStatus } from "@/lib/booking-state";
import type { Booking, Customer, PaymentEntry, Session } from "@/lib/types";
import { newUuid } from "@/lib/uuid";
import { bookings as seed, currentShop, customers as seedCustomers, sessions, workshops } from "./data";
import { isAccountActive } from "./account-status";
import { queueBookingCancelled, queueBookingConfirmation, queueBookingInfo, queueShopBookingNotice } from "./outbox-store";
import { allPromotions, shopToday } from "./promotion-store";
import { withAdminChanges } from "./session-admin-store";
import { withWorkshopStatus } from "./workshop-status-store";

/** The sessions as the shop-owner screens show them: an administrator's close or reopen counts, and the seats taken are counted from the live bookings. */
export function shopSessions(): Session[] {
  const live = liveBookings();
  return withAdminChanges(sessions).map((s) => ({ ...s, reservedCount: reservedSeats(live, s.id) }));
}

/** A session as the server knows it now: an administrator's close or reopen counts, and a session whose time is over is Closed. */
export function liveSession(id: string, now: Date = new Date()): Session | undefined {
  const s = withAdminChanges(sessions).find((x) => x.id === id);
  return s && closeIfEnded(s, now);
}

interface Change { status: BookingStatus; cancelReason?: string; cancelledBy?: "SHOP" | "GUEST"; checkedInAt?: string; statusBeforeCheckIn?: PreCheckInStatus }
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
  /** The account a guest registered, by customer id: the name and phone they gave and their profile (it is added to a customer who booked before). */
  accounts: Map<string, { fullName: string; phone?: string; locale?: Customer["preferredLocale"]; account: NonNullable<Customer["account"]> }>;
}
const g = globalThis as unknown as { __bookingStore?: Store };
const store = (): Store => {
  const st = (g.__bookingStore ??= { changes: new Map(), made: [], madeCustomers: [], tokens: new Map(), keys: new Map(), extra: new Map(), accounts: new Map() });
  st.extra ??= new Map(); // a store made before these fields existed (a dev server that reloaded its code)
  st.accounts ??= new Map();
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
      ...rest, payments, paymentStatus: extra ? computePaymentStatus(b.totalAmount, payments) : b.paymentStatus, status, ...(c ? { cancelReason: c.cancelReason ?? b.cancelReason, checkedInAt: c.checkedInAt, ...(c.cancelledBy ? { cancelledBy: c.cancelledBy } : {}) } : {}), ...(before ? { statusBeforeCheckIn: before } : {}),
    };
  });
}

/**
 * The shop sets a booking Paid or Unpaid after the session. Paid records the missing amount as a cash payment; Unpaid gives back what was paid as a
 * refund entry (entries are only added, never changed); a booking that becomes Paid is also set to Checked in, and a Checked in booking set to Unpaid goes
 * back to the status it had before the check-in (however it was checked in). False when the booking does not exist or has nothing to pay. TODO(api): in the transaction
 * of the endpoint, with the audit log. A cancelled booking takes no payment.
 */
export function recordPaid(id: string, paid: boolean, by: string, now: Date = new Date()): boolean {
  const b = liveBookings().find((x) => x.id === id);
  if (!b || b.totalAmount <= 0 || b.status === "CANCELLED") return false; // a cancelled booking takes no payment
  if (liveSession(b.sessionId, now)?.status === "COMPLETED") return false; // a completed session is final: its payments no longer change
  const net = netPaid(b.payments);
  if (paid ? b.paymentStatus === "PAID" : b.paymentStatus === "UNPAID") return true;
  const entry: PaymentEntry = {
    id: `pm-srv-${newUuid()}`, type: paid ? "PAYMENT" : "REFUND", amount: paid ? b.totalAmount - Math.max(0, net) : net, method: "CASH",
    note: paid ? "Payment confirmed after the session" : "Marked as unpaid", recordedAt: now.toISOString(), recordedBy: by,
  };
  store().extra.set(id, [...(store().extra.get(id) ?? []), entry]);
  // A booking that becomes Paid is also Checked in (the guest came and paid): from Not confirmed or Confirmed, the status before is kept. A cancelled
  // or already checked in booking keeps its status when it becomes Paid.
  if (paid && isOpen(b.status)) setBookingStatus(id, "CHECKED_IN", undefined, now.toISOString(), b.status);
  else if (!paid && b.status === "CHECKED_IN") setBookingStatus(id, b.statusBeforeCheckIn ?? "CONFIRMED"); // back to the status before the check-in (CONFIRMED when it was never recorded)
  return true;
}

/** The customers of the shop: the demo ones, and the ones guests became by booking, with the account a guest registered. */
export const liveCustomers = (): Customer[] =>
  [...seedCustomers, ...store().madeCustomers]
    .map((c) => {
      const a = store().accounts.get(c.id);
      if (!a) return c;
      const { phone: _phone, ...rest } = c; // the phone of the account replaces the one of the customer (and may be none)
      void _phone;
      return { ...rest, fullName: a.fullName, ...(a.phone ? { phone: a.phone } : {}), ...(a.locale ? { preferredLocale: a.locale } : {}), account: a.account };
    });

const normalizeEmail = (email: string) => email.trim().toLowerCase();
/** The customers who have this email, those with an account first (so a booking goes to the account of the email when it has one). */
const customersWithEmail = (email: string): Customer[] =>
  liveCustomers().filter((c) => c.email && normalizeEmail(c.email) === normalizeEmail(email)).sort((a, b) => Number(Boolean(b.account)) - Number(Boolean(a.account)));

/** Whether an email has an account, and how many bookings were made with it (as a guest or with the account). */
export function guestAccountStatus(email: string): { registered: boolean; bookings: number } {
  const mine = customersWithEmail(email);
  const ids = new Set(mine.map((c) => c.id));
  return { registered: mine.some((c) => c.account), bookings: liveBookings().filter((b) => ids.has(b.customerId)).length };
}

export type RegisterResult = { ok: true; customerId: string; created: boolean; merged: number } | { ok: false; code: "ALREADY_REGISTERED" };

/**
 * A guest registers an account. The bookings made before with the same email (a guest who booked without an account) are merged into it: the customer who
 * booked becomes the account, so every booking of that email is in it (a new customer is made only when the email never booked). `merged` is how many
 * bookings the account got that way. Refused when the email has an account already.
 */
export function registerGuestAccount(input: { email: string; fullName: string; country: string; birthDate: string; categories: WorkshopCategory[]; consentAt?: string; phone?: string; locale?: Customer["preferredLocale"] }): RegisterResult {
  const email = normalizeEmail(input.email);
  const matches = customersWithEmail(email);
  if (matches.some((c) => c.account)) return { ok: false, code: "ALREADY_REGISTERED" };
  const account = { country: input.country, birthDate: input.birthDate, favoriteCategories: input.categories, ...(input.consentAt ? { consentAt: input.consentAt } : {}) };
  const phone = input.phone?.trim() || undefined;
  if (matches.length === 0) {
    const customer: Customer = { id: `cu-${newUuid().slice(0, 8)}`, fullName: input.fullName.trim(), email, ...(phone ? { phone } : {}), preferredLocale: input.locale ?? currentShop.defaultLocale, account };
    store().madeCustomers.push(customer);
    return { ok: true, customerId: customer.id, created: true, merged: 0 };
  }
  const primary = matches[0]!;
  const merged = liveBookings().filter((b) => b.customerId === primary.id).length;
  store().accounts.set(primary.id, { fullName: input.fullName.trim(), ...((phone ?? primary.phone) ? { phone: phone ?? primary.phone } : {}), account });
  return { ok: true, customerId: primary.id, created: false, merged };
}

/**
 * The customer with this id when they have an account and `email` is the email of that account (any case, spaces at the ends); otherwise nothing. `email` is
 * null only when the login of the guest area is switched off (see customerLoginRequired): then the id alone is enough.
 */
export function accountOfGuest(id: string, email: string | null): Customer | undefined {
  const c = liveCustomers().find((x) => x.id === id);
  if (!c?.account || !isAccountActive(c.id)) return undefined; // a deactivated account (by an administrator, or until a reset of the password is done) is closed
  return email === null || (c.email && normalizeEmail(c.email) === normalizeEmail(email)) ? c : undefined;
}

export interface AccountPatch {
  fullName: string; phone?: string; locale: Customer["preferredLocale"]; country: string; birthDate: string; favoriteCategories: WorkshopCategory[]; gender?: Gender; socials?: Socials; avatarUrl?: string;
}

/**
 * The guest changes their own profile: name, phone, language, country, date of birth, gender, social accounts and picture (never the email). Whatever is
 * not given is removed (the profile is replaced as a whole), except what the guest agreed to at registration (`consentAt`). The same answer for an unknown
 * id, a customer without an account and a wrong email. TODO(api): the account of the guest session, not the email in a header.
 */
export function updateGuestAccount(id: string, email: string | null, patch: AccountPatch): { ok: true; customer: Customer } | { ok: false; code: "NOT_FOUND" } {
  const current = accountOfGuest(id, email);
  if (!current?.account) return { ok: false, code: "NOT_FOUND" };
  const socials = Object.fromEntries(socialEntries(patch.socials)) as Socials;
  const account: NonNullable<Customer["account"]> = {
    country: patch.country, birthDate: patch.birthDate, favoriteCategories: patch.favoriteCategories,
    ...(patch.gender ? { gender: patch.gender } : {}), ...(Object.keys(socials).length ? { socials } : {}), ...(patch.avatarUrl ? { avatarUrl: patch.avatarUrl } : {}),
    ...(current.account.consentAt ? { consentAt: current.account.consentAt } : {}),
  };
  store().accounts.set(id, { fullName: patch.fullName, ...(patch.phone ? { phone: patch.phone } : {}), locale: patch.locale, account });
  return { ok: true, customer: liveCustomers().find((x) => x.id === id)! };
}

/** An administrator edits the name and phone of a customer account (nothing else of the profile; an empty phone removes it). False when there is no such account. */
export function adminUpdateGuestProfile(id: string, patch: { fullName: string; phone?: string }): boolean {
  const current = liveCustomers().find((x) => x.id === id);
  if (!current?.account) return false;
  const prev = store().accounts.get(id);
  store().accounts.set(id, { locale: prev?.locale ?? current.preferredLocale, account: current.account, fullName: patch.fullName, ...(patch.phone ? { phone: patch.phone } : {}) });
  return true;
}

/**
 * Records a status change of a booking; false when the booking does not exist. A check-in remembers the status the booking had (`before`, or the
 * one it has now when it is not given) so an uncheck-in goes back to it.
 */
export function setBookingStatus(id: string, status: BookingStatus, cancelReason?: string, checkedInAt?: string, before?: PreCheckInStatus, cancelledBy?: "SHOP" | "GUEST"): boolean {
  const base = allRows().find((b) => b.id === id);
  if (!base) return false;
  const now = liveBookings().find((b) => b.id === id)!;
  // The time of the check-in is kept while the booking is checked in; any other status (an uncheck-in, a cancel) drops it.
  const keep = status === "CHECKED_IN" ? (checkedInAt ?? now.checkedInAt) : undefined;
  const wasBefore = status === "CHECKED_IN" ? (before ?? (isOpen(now.status) ? now.status : now.statusBeforeCheckIn) ?? "CONFIRMED") : undefined;
  changes().set(id, { status, ...(cancelReason ? { cancelReason } : {}), ...(status === "CANCELLED" && cancelledBy ? { cancelledBy } : {}), ...(keep ? { checkedInAt: keep } : {}), ...(wasBefore ? { statusBeforeCheckIn: wasBefore } : {}) });
  return true;
}

// ---- the shop makes a booking for a guest (walk-in, phone, other) ---------------------------------------------------------------------

export interface ManualBookingInput {
  sessionId: string; quantity: number; source: "WALK_IN" | "PHONE" | "OTHER"; fullName: string; email?: string; phone?: string; specialRequest?: string;
}
export type ManualBookingResult =
  | { ok: true; booking: Booking; emailed: boolean }
  | { ok: false; code: "UNKNOWN_SESSION" | "SESSION_CLOSED" | "QUANTITY" | "SESSION_FULL" | "EMAIL_REQUIRED" };

/**
 * The shop makes a booking for a guest who is at the studio or calls. It is CONFIRMED at once (the shop confirmed it with the guest) and, when the guest gave an
 * email, the guest gets an email with the details (no link: there is nothing to confirm). Walk-ins may be made for a session that has started, while seats remain.
 * The price is the server's (no promotions). The customer is found by email, or made; the booking keeps the name that was typed.
 */
export function createManualBooking(input: ManualBookingInput, now: Date = new Date()): ManualBookingResult {
  const session = liveSession(input.sessionId, now);
  const workshop = session && workshops.find((w) => w.id === session.workshopId);
  if (!session || !workshop) return { ok: false, code: "UNKNOWN_SESSION" };
  if (!isSessionBookable(session.status)) return { ok: false, code: "SESSION_CLOSED" };
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > workshop.maxPerBooking) return { ok: false, code: "QUANTITY" };
  const email = input.email?.trim() ? normalizeEmail(input.email) : undefined;
  if (!email && input.source !== "WALK_IN") return { ok: false, code: "EMAIL_REQUIRED" };
  const live = liveBookings();
  if (reservedSeats(live, session.id) + input.quantity > session.capacity) return { ok: false, code: "SESSION_FULL" };

  const name = input.fullName.trim();
  const phone = input.phone?.trim() || undefined;
  let customer = email ? customersWithEmail(email)[0] : undefined;
  if (!customer) {
    customer = { id: `cu-${newUuid().slice(0, 8)}`, fullName: name, ...(email ? { email } : {}), ...(phone ? { phone } : {}), preferredLocale: currentShop.defaultLocale };
    store().madeCustomers.push(customer);
  }
  const booking: Booking = {
    id: `bk-${newUuid().slice(0, 8)}`, bookingCode: nextBookingCode(session.code, live.map((b) => b.bookingCode)), sessionId: session.id, workshopId: workshop.id,
    customerId: customer.id, guestName: name, source: input.source, quantity: input.quantity, status: "CONFIRMED", paymentStatus: "UNPAID", unitPriceAmount: workshop.priceAmount,
    totalAmount: workshop.priceAmount * input.quantity, currency: workshop.currency, workshopTitle: pickLocalized(workshop.title, currentShop.defaultLocale, currentShop.defaultLocale), startsAt: session.startsAt, endsAt: session.endsAt,
    timezone: currentShop.timezone, createdAt: now.toISOString(), payments: [],
    ...(input.specialRequest?.trim() ? { specialRequest: input.specialRequest.trim() } : {}),
  };
  store().made.push(booking);
  if (email) {
    queueBookingInfo({
      to: email, locale: customer.preferredLocale, guestName: name, shopName: currentShop.name, bookingCode: booking.bookingCode, workshopTitle: booking.workshopTitle, timezone: booking.timezone,
      startsAt: booking.startsAt, endsAt: booking.endsAt, quantity: booking.quantity, totalAmount: booking.totalAmount, currency: booking.currency,
      address: workshopAddress(workshop, currentShop.address), ...(ownAddressNote(workshop) ? { addressNote: ownAddressNote(workshop) } : {}),
    });
  }
  return { ok: true, booking, emailed: Boolean(email) };
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
  // The key only repeats a booking of the same guest for the same session (another body with the same key is a new booking).
  const key = idempotencyKey ? `${idempotencyKey}|${input.email.trim().toLowerCase()}|${input.sessionId}` : undefined;
  if (key) {
    const id = store().keys.get(key);
    const again = id ? liveBookings().find((b) => b.id === id) : undefined;
    if (again) return { ok: true, booking: again, confirmToken: [...store().tokens].find(([, v]) => v === again.id)?.[0] ?? "", repeated: true };
  }
  const session = liveSession(input.sessionId, now);
  const workshop = session && withWorkshopStatus(workshops).find((w) => w.id === session.workshopId);
  if (!session || !workshop) return { ok: false, code: "UNKNOWN_SESSION" };
  // Bookable: the session is Running, the booking is made before its cutoff, and the workshop is Active (FR-BOOK-01).
  if (!isSessionBookable(session.status) || workshop.status !== "ACTIVE" || Date.parse(session.startsAt) - session.bookingCutoffMinutes * 60_000 <= now.getTime()) return { ok: false, code: "SESSION_CLOSED" };
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
  // A guest who booked before with this email is the same customer; when the email has an account the booking is counted in the account.
  let customer = customersWithEmail(email)[0];
  if (!customer) {
    customer = { id: `cu-${newUuid().slice(0, 8)}`, fullName: input.fullName.trim(), email, ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}), preferredLocale: input.locale ?? currentShop.defaultLocale };
    store().madeCustomers.push(customer);
  }
  const booking: Booking = {
    id: `bk-${newUuid().slice(0, 8)}`, bookingCode: nextBookingCode(session.code, live.map((b) => b.bookingCode)), sessionId: session.id, workshopId: workshop.id,
    customerId: customer.id, guestName: input.fullName.trim(), source: "ONLINE", quantity: input.quantity, status: "NOT_CONFIRMED", paymentStatus: "UNPAID", unitPriceAmount: workshop.priceAmount,
    totalAmount: priced.total, currency: workshop.currency, workshopTitle: pickLocalized(workshop.title, input.locale ?? currentShop.defaultLocale, currentShop.defaultLocale), startsAt: session.startsAt, endsAt: session.endsAt,
    timezone: currentShop.timezone, createdAt: now.toISOString(), payments: [],
    ...(input.specialRequest?.trim() ? { specialRequest: input.specialRequest.trim() } : {}),
    ...(used.length ? { promotionIds: used.map((p) => p.id), discountAmount: priced.discount } : {}),
  };
  store().made.push(booking); // its workshop title is in the language the guest booked in
  const token = newUuid();
  store().tokens.set(token, booking.id);
  if (key) store().keys.set(key, booking.id);
  // The email goes to the person who booked, in their language, with the booking and the link that confirms it.
  queueBookingConfirmation({
    to: email, locale: customer.preferredLocale, guestName: booking.guestName ?? customer.fullName, shopName: currentShop.name, bookingCode: booking.bookingCode, workshopTitle: booking.workshopTitle, timezone: booking.timezone,
    startsAt: booking.startsAt, endsAt: booking.endsAt, quantity: booking.quantity, totalAmount: booking.totalAmount, currency: booking.currency, confirmUrl: confirmUrlFor(token),
    address: workshopAddress(workshop, currentShop.address), ...(ownAddressNote(workshop) ? { addressNote: ownAddressNote(workshop) } : {}),
  });
  // The shop is told of the new booking (it stays not confirmed until the guest opens the link).
  queueShopBookingNotice({
    to: currentShop.contactEmail, locale: currentShop.defaultLocale, guestName: booking.guestName ?? customer.fullName, shopName: currentShop.name, bookingCode: booking.bookingCode,
    workshopTitle: booking.workshopTitle, timezone: booking.timezone, kind: "CREATED", guestEmail: email, ...(input.phone?.trim() ? { guestPhone: input.phone.trim() } : {}),
    startsAt: booking.startsAt, endsAt: booking.endsAt, quantity: booking.quantity, totalAmount: booking.totalAmount, currency: booking.currency,
  });
  return { ok: true, booking, confirmToken: token, repeated: false };
}

// ---- a guest cancels their booking --------------------------------------------------------------------------------------------------------

/** A guest can cancel until the session starts, while the booking is Not confirmed or Confirmed and the session is not closed. */
export function canGuestCancel(booking: Pick<Booking, "status" | "sessionId" | "startsAt">, now: Date = new Date()): boolean {
  const session = liveSession(booking.sessionId, now);
  return isOpen(booking.status) && !!session && !isSessionFinished(session.status) && Date.parse(booking.startsAt) > now.getTime();
}

/**
 * A guest can check in to a booking that is Confirmed (the link of the email was opened), from CHECKIN_OPENS_MINUTES before the session starts until it ends, while the
 * session is not closed. (The shop can check a guest in at any time while the session is not closed.)
 */
export function canGuestCheckIn(booking: Pick<Booking, "status" | "sessionId" | "startsAt" | "endsAt">, now: Date = new Date()): boolean {
  const session = liveSession(booking.sessionId, now);
  const t = now.getTime();
  return booking.status === "CONFIRMED" && !!session && !isSessionFinished(session.status) && t >= Date.parse(booking.startsAt) - CHECKIN_OPENS_MINUTES * 60_000 && t < Date.parse(booking.endsAt);
}

export type GuestCheckInResult = { ok: true; booking: Booking } | { ok: false; code: "NOT_FOUND" | "NOT_CHECKABLE" };

/** A guest checks in to their own booking (found by its code among the bookings of that customer; anything else is NOT_FOUND). The check-in time is now. */
export function checkInByGuest(customerId: string, code: string, now: Date = new Date()): GuestCheckInResult {
  const b = liveBookings().find((x) => x.bookingCode === code && x.customerId === customerId);
  if (!b) return { ok: false, code: "NOT_FOUND" };
  if (!canGuestCheckIn(b, now)) return { ok: false, code: "NOT_CHECKABLE" };
  setBookingStatus(b.id, "CHECKED_IN", undefined, now.toISOString(), "CONFIRMED", undefined);
  return { ok: true, booking: liveBookings().find((x) => x.id === b.id)! };
}

export type GuestCancelResult = { ok: true; booking: Booking } | { ok: false; code: "NOT_FOUND" | "NOT_CANCELLABLE" };

/**
 * A guest cancels their own booking, found by its code AND the email of the booking (anything else is NOT_FOUND, the same answer as for a code that does not
 * exist). Allowed until the session starts, while the booking is Not confirmed or Confirmed (a checked in booking cannot be cancelled, nor one of a session that
 * is closed). The reason is optional. The seats go back at once, the guest gets a confirmation email and the shop is told.
 */
export function cancelBookingByGuest(code: string, email: string, reason: string | undefined, now: Date = new Date()): GuestCancelResult {
  const booking = liveBookings().find((b) => b.bookingCode === code.trim().toUpperCase());
  const customer = booking && liveCustomers().find((c) => c.id === booking.customerId);
  if (!booking || !customer?.email || normalizeEmail(customer.email) !== normalizeEmail(email)) return { ok: false, code: "NOT_FOUND" };
  if (!canGuestCancel(booking, now)) return { ok: false, code: "NOT_CANCELLABLE" };
  const why = reason?.trim().slice(0, 300) || undefined;
  setBookingStatus(booking.id, "CANCELLED", why, undefined, undefined, "GUEST");
  const cancelled = liveBookings().find((b) => b.id === booking.id)!;
  const guestName = booking.guestName ?? customer.fullName;
  queueBookingCancelled({
    to: normalizeEmail(customer.email), locale: customer.preferredLocale, guestName, shopName: currentShop.name, bookingCode: booking.bookingCode, workshopTitle: booking.workshopTitle,
    timezone: booking.timezone, startsAt: booking.startsAt, endsAt: booking.endsAt, quantity: booking.quantity, byGuest: true, ...(why ? { reason: why } : {}),
  });
  queueShopBookingNotice({
    to: currentShop.contactEmail, locale: currentShop.defaultLocale, guestName, shopName: currentShop.name, bookingCode: booking.bookingCode, workshopTitle: booking.workshopTitle,
    timezone: booking.timezone, kind: "CANCELLED_BY_GUEST", guestEmail: normalizeEmail(customer.email), ...(customer.phone ? { guestPhone: customer.phone } : {}),
    startsAt: booking.startsAt, endsAt: booking.endsAt, quantity: booking.quantity, totalAmount: booking.totalAmount, currency: booking.currency, ...(why ? { reason: why } : {}),
  });
  return { ok: true, booking: cancelled };
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

