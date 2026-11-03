import type { Metadata } from "next";
import { BookingLinkResult } from "@/components/booking/BookingConfirmation";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSite } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";
import { confirmBookingByToken } from "@/lib/mock/booking-store";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The link of the confirmation email: opening it confirms the booking (NOT_CONFIRMED -> CONFIRMED). Opening it again is harmless.
// TODO(api): confirm on a click of a button, so a mail scanner that opens the link cannot confirm by itself.
export default async function ConfirmBookingPage({ params }: PageProps<"/sites/[slug]/booking/confirm/[token]">) {
  const { slug, token } = await params;
  const { shop, theme } = requireSite(slug);
  const base = await getSiteBase(slug);
  const res = confirmBookingByToken(token);
  const kind = res.ok ? (res.already ? "already" : "confirmed") : res.code === "CANCELLED" ? "cancelled" : "invalid";
  return (
    <SiteIntlProvider locale={shop.defaultLocale}>
      <SiteFrame theme={theme} locale={shop.defaultLocale}>
        <main>
          <BookingLinkResult kind={kind} code={res.ok ? res.booking.bookingCode : undefined} homeHref={base || "/"} />
        </main>
      </SiteFrame>
    </SiteIntlProvider>
  );
}
