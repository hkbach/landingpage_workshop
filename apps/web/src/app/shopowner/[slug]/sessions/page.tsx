import { SessionsManager } from "@/components/catalog/sessions-manager";
import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { realApi } from "@/lib/api-server";
import { loadOpsData } from "@/lib/own-ops";

export default async function SessionsPage() {
  if (realApi()) {
    const d = await loadOpsData();
    return (
      <SessionsManager
        viaApi sessions={d.sessions} bookings={d.bookings} customers={d.customers} workshops={d.workshops} nowIso={new Date().toISOString()} actor={d.shop.ownerName}
        shop={{ currency: d.shop.currency, timezone: d.shop.timezone, defaultLocale: d.shop.defaultLocale, enabledLocales: d.shop.enabledLocales }}
      />
    );
  }
  const bookings = liveBookings();
  return (
    <SessionsManager
      sessions={shopSessions()} bookings={bookings} customers={liveCustomers()} workshops={withWorkshopStatus(workshops)} nowIso={new Date().toISOString()} actor={currentShop.ownerName}
      shop={{ currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
