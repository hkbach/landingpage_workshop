import { bookings, currentShop, customers, sessions, workshops } from "@/lib/mock/data";
import { BookingsList } from "@/components/ops/bookings-list";

export default function BookingsPage() {
  return (
    <BookingsList
      bookings={bookings} sessions={sessions} customers={customers} workshops={workshops}
      timezone={currentShop.timezone} defaultLocale={currentShop.defaultLocale} enabledLocales={currentShop.enabledLocales} nowIso={new Date().toISOString()}
    />
  );
}
