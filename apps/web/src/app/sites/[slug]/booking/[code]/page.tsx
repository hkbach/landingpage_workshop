import { BOOKING_CODE_RE, pickLocalized } from "@workshop/shared";
import type { Metadata } from "next";
import { BookingConfirmation, BookingNotFound } from "@/components/booking/BookingConfirmation";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSiteShell } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";
import { lookupGuestBooking } from "@/lib/public-booking";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// Lookup needs the booking code AND the matching email; anything else shows the same generic message (no enumeration).
export default async function BookingPage({ params, searchParams }: PageProps<"/sites/[slug]/booking/[code]">) {
  const { slug, code } = await params;
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const site = await requireSiteShell(slug);
  const { shop, theme } = site;
  const base = await getSiteBase(slug, site.customDomain);
  const homeHref = base || "/";

  const b = email && BOOKING_CODE_RE.test(code.toUpperCase()) ? await lookupGuestBooking(slug, code.toUpperCase(), email) : null;
  const shopInfo = { name: shop.name, address: shop.address, mapsUrl: shop.mapsUrl, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone };
  // Where the guest goes: the address of the workshop they booked (its own, or the shop's).
  const whereInfo = b ? { ...shopInfo, address: b.address || shop.address } : shopInfo;

  return (
    <SiteIntlProvider locale={shop.defaultLocale}>
      <SiteFrame theme={theme} locale={shop.defaultLocale}>
        <main>
          {b ? (
            <BookingConfirmation
              locale={shop.defaultLocale} shop={whereInfo} homeHref={homeHref} cancel={b.canCancel ? { slug } : undefined}
              data={{
                code: b.code, email: email.trim().toLowerCase(), workshopTitle: pickLocalized(b.workshopTitle, shop.defaultLocale, shop.defaultLocale),
                startsAt: b.startsAt, endsAt: b.endsAt, timezone: b.timezone, quantity: b.quantity, totalAmount: b.totalAmount, currency: b.currency, status: b.status,
                ...(b.cancelledBy ? { cancelledBy: b.cancelledBy as "GUEST" | "SHOP" } : {}), ...(b.cancelReason ? { cancelReason: b.cancelReason } : {}),
              }}
            />
          ) : (
            <BookingNotFound homeHref={homeHref} />
          )}
        </main>
      </SiteFrame>
    </SiteIntlProvider>
  );
}
