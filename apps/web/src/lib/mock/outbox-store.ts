// SERVER-ONLY: the emails the mock backend "sends", until apps/api exists. The real backend writes an outbox event in the same transaction as the
// change and a worker sends the email in the language of the guest (REQUIREMENTS 5.7), so nothing is sent from a request handler.
// Lives on globalThis like the other mock stores.
import type { Locale, SessionCloseReason } from "@workshop/shared";
import { renderBookingCancelled, renderBookingConfirmation, renderBookingInfo, renderPaymentReceived, renderShopBookingNotice, renderSessionClosed, renderSessionRescheduled, type RenderedEmail } from "@/lib/email/templates";
import { newUuid } from "@/lib/uuid";

interface EmailBase extends RenderedEmail {
  id: string;
  to: string;
  /** The language the guest prefers. It does NOT choose the language of the email: every email holds the same message in six languages (see templates). */
  locale: Locale;
  guestName: string;
  shopName: string;
  bookingCode: string;
  workshopTitle: string;
  timezone: string;
  createdAt: string;
}

export interface SessionRescheduledEmail extends EmailBase {
  type: "SESSION_RESCHEDULED";
  oldStartsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  reason: SessionCloseReason;
}

/** A session was closed: by its owner or an administrator (`reason`), or by the system when its time ended (`auto`, no reason). */
export interface SessionClosedEmail extends EmailBase {
  type: "SESSION_CLOSED";
  startsAt: string;
  endsAt: string;
  auto: boolean;
  reason?: SessionCloseReason;
}

/** A guest made a booking: the email with the booking and the link that confirms it (the booking is NOT_CONFIRMED until the link is opened). */
export interface BookingConfirmationEmail extends EmailBase {
  type: "BOOKING_CONFIRMATION";
  startsAt: string;
  endsAt: string;
  quantity: number;
  totalAmount: number;
  currency: string;
  /** The link that confirms the booking (a secret: only the guest gets it, by email). */
  confirmUrl: string;
}

/** The shop made a booking for a guest (walk-in, phone): the booking is confirmed already, the email holds its details. */
export interface BookingInfoEmail extends EmailBase {
  type: "BOOKING_INFO";
  startsAt: string;
  endsAt: string;
  quantity: number;
  totalAmount: number;
  currency: string;
}

/** A booking was cancelled by the guest (a confirmation for the guest) or by the shop (the guest is told). */
export interface BookingCancelledEmail extends EmailBase {
  type: "BOOKING_CANCELLED";
  startsAt: string;
  endsAt: string;
  quantity: number;
  byGuest: boolean;
  reason?: string;
}

/** The email the shop receives when a guest books or cancels (`to` is the contact email of the shop). */
export interface ShopBookingNoticeEmail extends EmailBase {
  type: "SHOP_BOOKING_NOTICE";
  kind: "CREATED" | "CANCELLED_BY_GUEST";
  guestEmail?: string;
  guestPhone?: string;
  startsAt: string;
  endsAt: string;
  quantity: number;
  totalAmount: number;
  currency: string;
  reason?: string;
}

/** The shop confirmed the payment of a booking (it is Paid): a receipt for the guest. */
export interface PaymentReceivedEmail extends EmailBase {
  type: "PAYMENT_RECEIVED";
  startsAt: string;
  endsAt: string;
  quantity: number;
  totalAmount: number;
  currency: string;
}

export type OutboxEmail = SessionRescheduledEmail | SessionClosedEmail | BookingConfirmationEmail | BookingInfoEmail | BookingCancelledEmail | ShopBookingNoticeEmail | PaymentReceivedEmail;

const g = globalThis as unknown as { __outbox?: OutboxEmail[] };
const box = () => (g.__outbox ??= []);

type Queued<T extends { type: string }> = Omit<T, "id" | "type" | "createdAt" | keyof RenderedEmail>;

export function queueSessionRescheduled(email: Queued<SessionRescheduledEmail>): SessionRescheduledEmail {
  const entry: SessionRescheduledEmail = { ...email, ...renderSessionRescheduled(email), id: newUuid(), type: "SESSION_RESCHEDULED", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export function queueSessionClosed(email: Queued<SessionClosedEmail>): SessionClosedEmail {
  const entry: SessionClosedEmail = { ...email, ...renderSessionClosed(email), id: newUuid(), type: "SESSION_CLOSED", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export function queueBookingConfirmation(email: Queued<BookingConfirmationEmail>): BookingConfirmationEmail {
  const entry: BookingConfirmationEmail = { ...email, ...renderBookingConfirmation(email), id: newUuid(), type: "BOOKING_CONFIRMATION", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export function queueBookingInfo(email: Queued<BookingInfoEmail>): BookingInfoEmail {
  const entry: BookingInfoEmail = { ...email, ...renderBookingInfo(email), id: newUuid(), type: "BOOKING_INFO", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export function queueBookingCancelled(email: Queued<BookingCancelledEmail>): BookingCancelledEmail {
  const entry: BookingCancelledEmail = { ...email, ...renderBookingCancelled(email), id: newUuid(), type: "BOOKING_CANCELLED", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export function queueShopBookingNotice(email: Queued<ShopBookingNoticeEmail>): ShopBookingNoticeEmail {
  const entry: ShopBookingNoticeEmail = { ...email, ...renderShopBookingNotice(email), id: newUuid(), type: "SHOP_BOOKING_NOTICE", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export function queuePaymentReceived(email: Queued<PaymentReceivedEmail>): PaymentReceivedEmail {
  const entry: PaymentReceivedEmail = { ...email, ...renderPaymentReceived(email), id: newUuid(), type: "PAYMENT_RECEIVED", createdAt: new Date().toISOString() };
  box().push(entry);
  return entry;
}

export const outboxEmails = (): OutboxEmail[] => box().map((e) => ({ ...e }));

/** One queued email (with its html), by id. */
export const outboxEmail = (id: string): OutboxEmail | undefined => box().find((e) => e.id === id);

/** Demo only: the id of the latest confirmation email of a booking, so the confirmation page can offer to open it (a real guest gets it by email). */
export function demoConfirmationEmailId(bookingCode: string): string | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  return [...box()].reverse().find((e) => e.type === "BOOKING_CONFIRMATION" && e.bookingCode === bookingCode)?.id;
}

/** Test helper. */
export function resetOutbox(): void {
  g.__outbox = [];
}
