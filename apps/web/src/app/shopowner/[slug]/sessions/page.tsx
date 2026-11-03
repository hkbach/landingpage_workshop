import { SessionsManager } from "@/components/catalog/sessions-manager";
import { liveBookings } from "@/lib/mock/booking-store";
import { currentShop, customers, sessions, workshops } from "@/lib/mock/data";
import { withAdminChanges } from "@/lib/mock/session-admin-store";

export default function SessionsPage() {
  const bookings = liveBookings();
  return (
    <SessionsManager
      sessions={withAdminChanges(sessions)} bookings={bookings} customers={customers} workshops={workshops} nowIso={new Date().toISOString()} actor={currentShop.ownerName}
      shop={{ currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
