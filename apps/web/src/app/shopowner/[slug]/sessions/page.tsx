import { SessionsManager } from "@/components/catalog/sessions-manager";
import { liveBookings, liveCustomers, shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";

export default function SessionsPage() {
  const bookings = liveBookings();
  return (
    <SessionsManager
      sessions={shopSessions()} bookings={bookings} customers={liveCustomers()} workshops={withWorkshopStatus(workshops)} nowIso={new Date().toISOString()} actor={currentShop.ownerName}
      shop={{ currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
