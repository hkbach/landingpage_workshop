import { BookingForm } from "@/components/ops/booking-form";
import { loadOwnShop } from "@/lib/own-shop";
import { ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { fetchAll } from "@/lib/shop-data";
import { notFound } from "next/navigation";

/** The start of the sessions a booking can still be made for: those that began less than six hours ago, or are to come. */
const since = (): string => new Date(Date.now() - 6 * 3_600_000).toISOString();

export default async function NewBookingPage(props: PageProps<"/shopowner/[slug]/bookings/new">) {
  const sp = await props.searchParams;
  const session = typeof sp.session === "string" ? sp.session : undefined;
  const [shop, list, sessions] = await Promise.all([loadOwnShop(), ownWorkshops(), // only the sessions that have not ended long ago: a booking is made for one that is to come (or is on now)
    fetchAll<Parameters<typeof toSession>[0]>(`/sessions?from=${encodeURIComponent(since())}`)]);
  if (!shop) notFound();
  return (
    <BookingForm
      sessions={sessions.map(toSession)} workshops={list} initialSessionId={session} nowIso={new Date().toISOString()}
      shop={{ timezone: shop.timezone, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales }}
    />
  );
}
