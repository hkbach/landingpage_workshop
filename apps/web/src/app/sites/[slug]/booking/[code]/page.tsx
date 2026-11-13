import { BOOKING_CODE_RE, pickLocalized, workshopDirectionsUrl, type BookingStatus } from "@workshop/shared";
import type { Metadata } from "next";
import { BookingConfirmation, BookingNotFound, SimulatedBookingConfirmation } from "@/components/booking/BookingConfirmation";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSite } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";
import { realApi } from "@/lib/api-server";
import { canGuestCancel, demoConfirmToken } from "@/lib/mock/booking-store";
import { demoConfirmationEmailId } from "@/lib/mock/outbox-store";
import { findBookingForLookup } from "@/lib/mock/site";
import { lookupGuestBooking } from "@/lib/public-booking";

export const metadata: Metadata = { robots: { index: false, follow: false } };

type Shown = {
  code: string; workshopTitle: string; startsAt: string; endsAt: string; timezone: string; quantity: number; totalAmount: number; currency: string; status: BookingStatus;
  cancelledBy?: string | null; cancelReason?: string | null;
};

// Lookup needs the booking code AND the matching email; anything else shows the same generic message (no enumeration).
export default async function BookingPage({ params, searchParams }: PageProps<"/sites/[slug]/booking/[code]">) {
  const { slug, code } = await params;
  const sp = await searchParams;
  const email = typeof sp.email === "string" ? sp.email : "";
  const site = await requireSite(slug);
  const { shop, theme } = site;
  const base = await getSiteBase(slug, site.customDomain);
  const homeHref = base || "/";

  // What the page shows: from the API (the booking of the guest, found by the code AND the email) or from the sample data.
  let shown: Shown | undefined;
  let cancellable = false;
  let where: { address?: string; mapsUrl?: string; addressNote?: string } = {};
  let demoToken: string | undefined;
  let demoEmailId: string | undefined;
  if (realApi()) {
    const b = email && BOOKING_CODE_RE.test(code.toUpperCase()) ? await lookupGuestBooking(slug, code.toUpperCase(), email) : null;
    if (b) {
      shown = { code: b.code, workshopTitle: pickLocalized(b.workshopTitle, shop.defaultLocale, shop.defaultLocale), startsAt: b.startsAt, endsAt: b.endsAt, timezone: b.timezone, quantity: b.quantity, totalAmount: b.totalAmount, currency: b.currency, status: b.status, cancelledBy: b.cancelledBy, cancelReason: b.cancelReason };
      cancellable = b.canCancel;
      where = { address: b.address };
    }
  } else {
    const found = findBookingForLookup(shop.id, code, email);
    if (found) {
      const bk = found.booking;
      shown = { code: bk.bookingCode, workshopTitle: bk.workshopTitle, startsAt: bk.startsAt, endsAt: bk.endsAt, timezone: bk.timezone, quantity: bk.quantity, totalAmount: bk.totalAmount, currency: bk.currency, status: bk.status, cancelledBy: bk.cancelledBy ?? null, cancelReason: bk.cancelReason ?? null };
      demoToken = demoConfirmToken(bk.id); // demo only: there is no mailbox in the prototype
      demoEmailId = demoToken ? demoConfirmationEmailId(bk.bookingCode) : undefined;
      cancellable = canGuestCancel(bk);
      const w = site.workshops.find((x) => x.id === bk.workshopId);
      if (w) {
        const maps = workshopDirectionsUrl(w, shop);
        where = { address: w.address ?? shop.address, ...(maps ? { mapsUrl: maps } : {}), ...(w.addressNote ? { addressNote: w.addressNote } : {}) };
      }
    }
  }
  const shopInfo = { name: shop.name, address: shop.address, mapsUrl: shop.mapsUrl, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone };
  // Where the guest goes: the address of the workshop they booked (its own, or the shop's) and the way to it.
  const whereInfo = shown ? { ...shopInfo, address: where.address ?? shop.address, mapsUrl: where.mapsUrl ?? shop.mapsUrl, ...(where.addressNote ? { addressNote: where.addressNote } : {}) } : shopInfo;

  return (
    <SiteIntlProvider locale={shop.defaultLocale}>
      <SiteFrame theme={theme} locale={shop.defaultLocale}>
        <main>
          {shown ? (
            <BookingConfirmation
              locale={shop.defaultLocale} shop={whereInfo} homeHref={homeHref} cancel={cancellable ? { slug } : undefined}
              data={{
                code: shown.code, email: email.trim().toLowerCase(), workshopTitle: shown.workshopTitle,
                startsAt: shown.startsAt, endsAt: shown.endsAt, timezone: shown.timezone,
                quantity: shown.quantity, totalAmount: shown.totalAmount, currency: shown.currency,
                status: shown.status, ...(shown.cancelledBy ? { cancelledBy: shown.cancelledBy as "GUEST" | "SHOP" } : {}), ...(shown.cancelReason ? { cancelReason: shown.cancelReason } : {}),
                ...(demoToken ? { demoConfirmUrl: `${base}/booking/confirm/${demoToken}` } : {}),
                ...(demoToken && demoEmailId ? { demoEmailUrl: `/api/v1/outbox/${demoEmailId}` } : {}),
              }}
            />
          ) : email && BOOKING_CODE_RE.test(code.toUpperCase()) && !realApi() ? (
            <SimulatedBookingConfirmation code={code.toUpperCase()} email={email} shop={shopInfo} locale={shop.defaultLocale} homeHref={homeHref} />
          ) : (
            <BookingNotFound homeHref={homeHref} />
          )}
        </main>
      </SiteFrame>
    </SiteIntlProvider>
  );
}
