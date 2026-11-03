import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { BookingsList } from "@/components/ops/bookings-list";
import { bookingPrices } from "@/lib/mock/ledger-source";

export default function BookingsPage() {
  const bookings = liveBookings();
  return (
    <BookingsList
      bookings={bookings} prices={bookingPrices(bookings)} currency={currentShop.currency} sessions={shopSessions()} customers={liveCustomers()} workshops={withWorkshopStatus(workshops)}
      actor={currentShop.ownerName} timezone={currentShop.timezone} defaultLocale={currentShop.defaultLocale} enabledLocales={currentShop.enabledLocales} nowIso={new Date().toISOString()}
    />
  );
}
