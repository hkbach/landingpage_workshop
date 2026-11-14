import { SessionsManager } from "@/components/catalog/sessions-manager";
import { loadOpsData } from "@/lib/own-ops";

export default async function SessionsPage() {
  const d = await loadOpsData();
  return (
    <SessionsManager
      viaApi sessions={d.sessions} bookings={d.bookings} customers={d.customers} workshops={d.workshops} nowIso={new Date().toISOString()} actor={d.shop.ownerName}
      shop={{ currency: d.shop.currency, timezone: d.shop.timezone, defaultLocale: d.shop.defaultLocale, enabledLocales: d.shop.enabledLocales }}
    />
  );
}
