import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { TodayView } from "@/components/ops/today-view";
import { realApi } from "@/lib/api-server";
import { loadOpsData } from "@/lib/own-ops";

export default async function TodayPage() {
  if (realApi()) {
    const d = await loadOpsData();
    return (
      <TodayView
        viaApi bookings={d.bookings} sessions={d.sessions} customers={d.customers} workshops={d.workshops} nowIso={new Date().toISOString()}
        shop={{ timezone: d.shop.timezone, currency: d.shop.currency, defaultLocale: d.shop.defaultLocale, enabledLocales: d.shop.enabledLocales, ownerName: d.shop.ownerName }}
      />
    );
  }
  const bookings = liveBookings();
  return (
    <TodayView
      bookings={bookings} sessions={shopSessions()} customers={liveCustomers()} workshops={withWorkshopStatus(workshops)} nowIso={new Date().toISOString()}
      shop={{ timezone: currentShop.timezone, currency: currentShop.currency, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales, ownerName: currentShop.ownerName }}
    />
  );
}
