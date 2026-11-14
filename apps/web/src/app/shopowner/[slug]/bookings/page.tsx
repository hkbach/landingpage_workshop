import { BookingsList } from "@/components/ops/bookings-list";
import { loadOpsData } from "@/lib/own-ops";

export default async function BookingsPage() {
  const d = await loadOpsData();
  return (
    <BookingsList
      viaApi bookings={d.bookings} prices={d.prices} currency={d.shop.currency} sessions={d.sessions} customers={d.customers} workshops={d.workshops}
      actor={d.shop.ownerName} timezone={d.shop.timezone} defaultLocale={d.shop.defaultLocale} enabledLocales={d.shop.enabledLocales} nowIso={new Date().toISOString()}
    />
  );
}
