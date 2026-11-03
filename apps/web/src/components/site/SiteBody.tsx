"use client";

import type { Locale, PromotionRecord } from "@workshop/shared";
import { BookingProvider } from "@/components/booking/BookingProvider";
import { FavoritesProvider } from "./FavoritesProvider";
import { ReportProvider } from "./ReportProvider";
import type { BookingShop } from "@/components/booking/BookingModal";
import { PageRenderer } from "@/components/sections/PageRenderer";
import type { RenderContext } from "@/components/sections/context";
import type { PageContent, PageTheme, Session, Workshop } from "@/lib/types";

/** Client boundary of the public page: booking modal state, favorites + the shared PageRenderer. */
export function SiteBody({ content, theme, ctx, shop, workshops, sessions, locale, basePath, promotions }: {
  content: PageContent; theme: PageTheme; ctx: RenderContext; shop: BookingShop; workshops: Workshop[]; sessions: Session[]; locale: Locale; basePath: string;
  /** Promotions active today; the booking form offers the ones that cover the chosen workshop. */
  promotions: PromotionRecord[];
}) {
  return (
    <BookingProvider shop={shop} workshops={workshops} sessions={sessions} theme={theme} locale={locale} basePath={basePath} promotions={promotions}>
      <FavoritesProvider slug={shop.slug} shopName={shop.name} theme={theme}>
        <ReportProvider slug={shop.slug} theme={theme}>
          <PageRenderer content={content} theme={theme} ctx={ctx} />
        </ReportProvider>
      </FavoritesProvider>
    </BookingProvider>
  );
}
