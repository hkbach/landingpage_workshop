// SERVER-ONLY: the guest is emailed when the shop confirms the payment of their booking (it became Paid). The server works the amount out itself from
// the booking (nothing about the amount comes from the browser). TODO(api): the payment entry and the outbox event are written in ONE transaction.
import { liveBookings, liveCustomers } from "./booking-store";
import { currentShop } from "./data";
import { queuePaymentReceived } from "./outbox-store";

export type PaymentMailResult = { ok: true; notified: number } | { ok: false };

/** Queues the "payment received" email of a booking: `notified` is 0 for a guest with no email (walk-in); `ok` is false when the booking does not exist. */
export function mailPaymentReceived(bookingId: string): PaymentMailResult {
  const b = liveBookings().find((x) => x.id === bookingId);
  if (!b) return { ok: false };
  const guest = liveCustomers().find((c) => c.id === b.customerId);
  if (!guest?.email) return { ok: true, notified: 0 };
  queuePaymentReceived({
    to: guest.email, locale: guest.preferredLocale, guestName: guest.fullName, shopName: currentShop.name, bookingCode: b.bookingCode, workshopTitle: b.workshopTitle,
    timezone: b.timezone, startsAt: b.startsAt, endsAt: b.endsAt, quantity: b.quantity, totalAmount: b.totalAmount, currency: b.currency,
  });
  return { ok: true, notified: 1 };
}
