// SERVER-ONLY: the guest is emailed when the shop cancels their booking (with the reason the shop gave). A guest with no email (walk-in) is not. TODO(api): the status
// change and the outbox event are written in ONE transaction.
import { liveBookings, liveCustomers } from "./booking-store";
import { currentShop } from "./data";
import { queueBookingCancelled } from "./outbox-store";

export function mailBookingCancelledByShop(bookingId: string): { notified: number } {
  const b = liveBookings().find((x) => x.id === bookingId);
  const guest = b && liveCustomers().find((c) => c.id === b.customerId);
  if (!b || !guest?.email) return { notified: 0 };
  queueBookingCancelled({
    to: guest.email.trim().toLowerCase(), locale: guest.preferredLocale, guestName: b.guestName ?? guest.fullName, shopName: currentShop.name, bookingCode: b.bookingCode,
    workshopTitle: b.workshopTitle, timezone: b.timezone, startsAt: b.startsAt, endsAt: b.endsAt, quantity: b.quantity, byGuest: false, ...(b.cancelReason ? { reason: b.cancelReason } : {}),
  });
  return { notified: 1 };
}
