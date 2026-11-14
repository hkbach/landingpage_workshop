import type { Metadata } from "next";
import { BookingLinkResult } from "@/components/booking/BookingConfirmation";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSite } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";
import { confirmGuestBooking } from "@/lib/public-booking";

export const metadata: Metadata = { robots: { index: false, follow: false } };

// The link of the confirmation email: opening it confirms the booking (NOT_CONFIRMED -> CONFIRMED). Opening it again is harmless.
// TODO: confirm on a click of a button, so a mail scanner that opens the link cannot confirm by itself.
export default async function ConfirmBookingPage({ params }: PageProps<"/sites/[slug]/booking/confirm/[token]">) {
  const { slug, token } = await params;
  const site = await requireSite(slug);
  const { shop, theme } = site;
  const base = await getSiteBase(slug, site.customDomain);
  const res = await confirmGuestBooking(token);
  const kind = res.kind;
  const code = "code" in res ? res.code : undefined;
  return (
    <SiteIntlProvider locale={shop.defaultLocale}>
      <SiteFrame theme={theme} locale={shop.defaultLocale}>
        <main>
          <BookingLinkResult kind={kind} code={code} homeHref={base || "/"} />
        </main>
      </SiteFrame>
    </SiteIntlProvider>
  );
}
