import { TodayView } from "@/components/ops/today-view";
import { loadOpsData } from "@/lib/own-ops";

export default async function TodayPage() {
  const d = await loadOpsData();
  return (
    <TodayView
      viaApi bookings={d.bookings} sessions={d.sessions} customers={d.customers} workshops={d.workshops} nowIso={new Date().toISOString()}
      shop={{ timezone: d.shop.timezone, currency: d.shop.currency, defaultLocale: d.shop.defaultLocale, enabledLocales: d.shop.enabledLocales, ownerName: d.shop.ownerName }}
    />
  );
}
