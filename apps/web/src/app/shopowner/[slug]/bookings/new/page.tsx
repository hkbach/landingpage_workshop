import { shopSessions } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { withWorkshopStatus } from "@/lib/mock/workshop-status-store";
import { BookingForm } from "@/components/ops/booking-form";
import { realApi } from "@/lib/api-server";
import { loadOwnShop } from "@/lib/own-shop";
import { ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { fetchAll } from "@/lib/shop-data";
import { notFound } from "next/navigation";

export default async function NewBookingPage(props: PageProps<"/shopowner/[slug]/bookings/new">) {
  const sp = await props.searchParams;
  const session = typeof sp.session === "string" ? sp.session : undefined;
  if (realApi()) {
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
  return (
    <BookingForm
      sessions={shopSessions()} workshops={withWorkshopStatus(workshops)} initialSessionId={session} nowIso={new Date().toISOString()}
      shop={{ timezone: currentShop.timezone, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales }}
    />
  );
}
