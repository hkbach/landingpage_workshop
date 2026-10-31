import type { Metadata } from "next";
import { BookingConfirmation, BookingNotFound, SimulatedBookingConfirmation } from "@/components/booking/BookingConfirmation";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSite } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";
import { findBookingForLookup } from "@/lib/mock/site";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Lookup needs the booking code AND the matching email; anything else shows the same generic message (no enumeration).
export default async function BookingPage({ params, searchParams }: PageProps<"/sites/[slug]/booking/[code]">) {
  const { slug, code } = await params;
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const { shop, theme } = requireSite(slug);
  const base = await getSiteBase(slug);
  const homeHref = base || "/";
  const found = findBookingForLookup(shop.id, code, email);
  const shopInfo = { name: shop.name, address: shop.address, mapsUrl: shop.mapsUrl, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone };

  return (
    <SiteIntlProvider locale={shop.defaultLocale}>
      <SiteFrame theme={theme} locale={shop.defaultLocale}>
        <main>
          {found ? (
            <BookingConfirmation
              locale={shop.defaultLocale} shop={shopInfo} homeHref={homeHref}
              data={{
                code: found.booking.bookingCode, email: email.trim().toLowerCase(), workshopTitle: found.booking.workshopTitle,
                startsAt: found.booking.startsAt, endsAt: found.booking.endsAt, timezone: found.booking.timezone,
                quantity: found.booking.quantity, totalAmount: found.booking.totalAmount, currency: found.booking.currency,
              }}
            />
          ) : email && /^[A-Za-z0-9]{8}$/.test(code) ? (
            <SimulatedBookingConfirmation code={code.toUpperCase()} email={email} shop={shopInfo} locale={shop.defaultLocale} homeHref={homeHref} />
          ) : (
            <BookingNotFound homeHref={homeHref} />
          )}
        </main>
      </SiteFrame>
    </SiteIntlProvider>
  );
}
