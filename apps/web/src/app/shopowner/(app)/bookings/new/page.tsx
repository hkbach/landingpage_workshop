import { currentShop, sessions, workshops } from "@/lib/mock/data";
import { BookingForm } from "@/components/ops/booking-form";

export default async function NewBookingPage(props: PageProps<"/shopowner/bookings/new">) {
  const sp = await props.searchParams;
  const session = typeof sp.session === "string" ? sp.session : undefined;
  return (
    <BookingForm
      sessions={sessions} workshops={workshops} initialSessionId={session} nowIso={new Date().toISOString()}
      shop={{ timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
