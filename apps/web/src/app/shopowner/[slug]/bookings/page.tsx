import { liveBookings, liveCustomers } from "@/lib/mock/booking-store";
import { currentShop, sessions, workshops } from "@/lib/mock/data";
import { BookingsList } from "@/components/ops/bookings-list";
import { bookingPrices } from "@/lib/mock/ledger-source";

export default function BookingsPage() {
  const bookings = liveBookings();
  return (
    <BookingsList
      bookings={bookings} prices={bookingPrices(bookings)} currency={currentShop.currency} sessions={sessions} customers={liveCustomers()} workshops={workshops}
      actor={currentShop.ownerName} timezone={currentShop.timezone} defaultLocale={currentShop.defaultLocale} enabledLocales={currentShop.enabledLocales} nowIso={new Date().toISOString()}
    />
  );
}
