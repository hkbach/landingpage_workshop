import { BookingForm } from "@/components/ops/booking-form";
import { loadOwnShop } from "@/lib/own-shop";
import { ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { fetchAll } from "@/lib/shop-data";
import { notFound } from "next/navigation";

export default async function NewBookingPage(props: PageProps<"/shopowner/[slug]/bookings/new">) {
  const sp = await props.searchParams;
  const session = typeof sp.session === "string" ? sp.session : undefined;
  const shop = await loadOwnShop();
  if (!shop) notFound();
  const [list, sessions] = await Promise.all([ownWorkshops(), fetchAll<Parameters<typeof toSession>[0]>("/sessions")]);
  return (
    <BookingForm
      sessions={sessions.map(toSession)} workshops={list} initialSessionId={session} nowIso={new Date().toISOString()}
      shop={{ timezone: shop.timezone, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales }}
    />
  );
}
