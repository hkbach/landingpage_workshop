import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { TodayView } from "@/components/ops/today-view";

export default function TodayPage() {
  const bookings = liveBookings();
  return (
    <TodayView
      bookings={bookings} sessions={shopSessions()} customers={liveCustomers()} workshops={withWorkshopStatus(workshops)} nowIso={new Date().toISOString()}
      shop={{ timezone: currentShop.timezone, currency: currentShop.currency, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales, ownerName: currentShop.ownerName }}
    />
  );
}
