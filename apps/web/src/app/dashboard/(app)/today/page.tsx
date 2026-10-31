import { bookings, currentShop, customers, sessions, workshops } from "@/lib/mock/data";
import { TodayView } from "@/components/ops/today-view";

export default function TodayPage() {
  return (
    <TodayView
      bookings={bookings} sessions={sessions} customers={customers} workshops={workshops} nowIso={new Date().toISOString()}
      shop={{ timezone: currentShop.timezone, currency: currentShop.currency, defaultLocale: currentShop.defaultLocale, ownerName: currentShop.ownerName }}
    />
  );
}
