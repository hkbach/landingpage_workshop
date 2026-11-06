import { BOOKING_CODE_RE, workshopDirectionsUrl } from "@workshop/shared";
import type { Metadata } from "next";
import { BookingConfirmation, BookingNotFound, SimulatedBookingConfirmation } from "@/components/booking/BookingConfirmation";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSite } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";
import { canGuestCancel, demoConfirmToken } from "@/lib/mock/booking-store";
import { demoConfirmationEmailId } from "@/lib/mock/outbox-store";
import { findBookingForLookup } from "@/lib/mock/site";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Lookup needs the booking code AND the matching email; anything else shows the same generic message (no enumeration).
export default async function BookingPage({ params, searchParams }: PageProps<"/sites/[slug]/booking/[code]">) {
  const { slug, code } = await params;
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const site = requireSite(slug);
  const { shop, theme } = site;
  const base = await getSiteBase(slug);
  const homeHref = base || "/";
  const found = findBookingForLookup(shop.id, code, email);
  const demoToken = found ? demoConfirmToken(found.booking.id) : undefined; // demo only: there is no mailbox in the prototype
  const demoEmailId = found ? demoConfirmationEmailId(found.booking.bookingCode) : undefined;
  const cancellable = found ? canGuestCancel(found.booking) : false;
  const shopInfo = { name: shop.name, address: shop.address, mapsUrl: shop.mapsUrl, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone };
  // Where the guest goes: the address of the workshop they booked (its own, or the shop's) and the way to it.
  const workshop = found ? site.workshops.find((w) => w.id === found.booking.workshopId) : undefined;
  const whereInfo = workshop
    ? { ...shopInfo, address: workshop.address ?? shop.address, mapsUrl: workshopDirectionsUrl(workshop, shop) ?? shop.mapsUrl, ...(workshop.addressNote ? { addressNote: workshop.addressNote } : {}) }
    : shopInfo;

  return (
    <SiteIntlProvider locale={shop.defaultLocale}>
      <SiteFrame theme={theme} locale={shop.defaultLocale}>
        <main>
          {found ? (
            <BookingConfirmation
              locale={shop.defaultLocale} shop={whereInfo} homeHref={homeHref} cancel={cancellable ? { slug } : undefined}
              data={{
                code: found.booking.bookingCode, email: email.trim().toLowerCase(), workshopTitle: found.booking.workshopTitle,
                startsAt: found.booking.startsAt, endsAt: found.booking.endsAt, timezone: found.booking.timezone,
                quantity: found.booking.quantity, totalAmount: found.booking.totalAmount, currency: found.booking.currency,
                status: found.booking.status, ...(found.booking.cancelledBy ? { cancelledBy: found.booking.cancelledBy } : {}), ...(found.booking.cancelReason ? { cancelReason: found.booking.cancelReason } : {}),
                ...(demoToken ? { demoConfirmUrl: `${base}/booking/confirm/${demoToken}` } : {}),
                ...(demoToken && demoEmailId ? { demoEmailUrl: `/api/v1/outbox/${demoEmailId}` } : {}),
              }}
            />
          ) : email && BOOKING_CODE_RE.test(code.toUpperCase()) ? (
            <SimulatedBookingConfirmation code={code.toUpperCase()} email={email} shop={shopInfo} locale={shop.defaultLocale} homeHref={homeHref} />
          ) : (
            <BookingNotFound homeHref={homeHref} />
          )}
        </main>
      </SiteFrame>
    </SiteIntlProvider>
  );
}
