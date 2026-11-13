import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { BookingsList } from "@/components/ops/bookings-list";
import { bookingPrices } from "@/lib/mock/ledger-source";
import { realApi } from "@/lib/api-server";
import { loadOpsData } from "@/lib/own-ops";

export default async function BookingsPage() {
  if (realApi()) {
    const d = await loadOpsData();
    return (
      <BookingsList
        viaApi bookings={d.bookings} prices={d.prices} currency={d.shop.currency} sessions={d.sessions} customers={d.customers} workshops={d.workshops}
        actor={d.shop.ownerName} timezone={d.shop.timezone} defaultLocale={d.shop.defaultLocale} enabledLocales={d.shop.enabledLocales} nowIso={new Date().toISOString()}
      />
    );
  }
  const bookings = liveBookings();
  return (
    <BookingsList
      bookings={bookings} prices={bookingPrices(bookings)} currency={currentShop.currency} sessions={shopSessions()} customers={liveCustomers()} workshops={withWorkshopStatus(workshops)}
      actor={currentShop.ownerName} timezone={currentShop.timezone} defaultLocale={currentShop.defaultLocale} enabledLocales={currentShop.enabledLocales} nowIso={new Date().toISOString()}
    />
  );
}
