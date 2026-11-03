import { liveBookings, liveCustomers } from "@/lib/mock/booking-store";
import { currentShop, sessions, workshops } from "@/lib/mock/data";
import { BookingsList } from "@/components/ops/bookings-list";
import { bookingPrices } from "@/lib/mock/ledger-source";
import { bookingTrend } from "@/lib/mock/trend";

export default function BookingsPage() {
  const bookings = liveBookings();
  return (
    <BookingsList
      bookings={bookings} prices={bookingPrices(bookings)} trend={bookingTrend(bookings, currentShop.timezone)} sessions={sessions} customers={liveCustomers()} workshops={workshops}
      timezone={currentShop.timezone} defaultLocale={currentShop.defaultLocale} enabledLocales={currentShop.enabledLocales} nowIso={new Date().toISOString()}
    />
  );
}
