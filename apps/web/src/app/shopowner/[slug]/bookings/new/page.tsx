import { shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { BookingForm } from "@/components/ops/booking-form";

export default async function NewBookingPage(props: PageProps<"/shopowner/[slug]/bookings/new">) {
  const sp = await props.searchParams;
  const session = typeof sp.session === "string" ? sp.session : undefined;
  return (
    <BookingForm
      sessions={shopSessions()} workshops={withWorkshopStatus(workshops)} initialSessionId={session} nowIso={new Date().toISOString()}
      shop={{ timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
