import { SessionsManager } from "@/components/catalog/sessions-manager";
import { bookings, currentShop, sessions, workshops } from "@/lib/mock/data";

export default function SessionsPage() {
  return (
    <SessionsManager
      sessions={sessions} bookings={bookings} workshops={workshops} nowIso={new Date().toISOString()} actor={currentShop.ownerName}
      shop={{ currency: currentShop.currency, timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
