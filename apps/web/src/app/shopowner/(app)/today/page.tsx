import { liveBookings } from "@/lib/mock/booking-store";
import { currentShop, customers, sessions, workshops } from "@/lib/mock/data";
import { TodayView } from "@/components/ops/today-view";

export default function TodayPage() {
  const bookings = liveBookings();
  return (
    <TodayView
      bookings={bookings} sessions={sessions} customers={customers} workshops={workshops} nowIso={new Date().toISOString()}
      shop={{ timezone: currentShop.timezone, currency: currentShop.currency, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales, ownerName: currentShop.ownerName }}
    />
  );
}
