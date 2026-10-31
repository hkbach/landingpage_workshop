"use client";

import type { Locale } from "@workshop/shared";
import { BookingProvider } from "@/components/booking/BookingProvider";
import { ReportProvider } from "./ReportProvider";
import type { BookingShop } from "@/components/booking/BookingModal";
import { PageRenderer } from "@/components/sections/PageRenderer";
import type { RenderContext } from "@/components/sections/context";
import type { PageContent, PageTheme, Session, Workshop } from "@/lib/types";

/** Client boundary of the public page: booking modal state + the shared PageRenderer. */
export function SiteBody({ content, theme, ctx, shop, workshops, sessions, locale, basePath }: {
  content: PageContent; theme: PageTheme; ctx: RenderContext; shop: BookingShop; workshops: Workshop[]; sessions: Session[]; locale: Locale; basePath: string;
}) {
  return (
    <BookingProvider shop={shop} workshops={workshops} sessions={sessions} theme={theme} locale={locale} basePath={basePath}>
      <ReportProvider slug={shop.slug} theme={theme}>
        <PageRenderer content={content} theme={theme} ctx={ctx} />
      </ReportProvider>
    </BookingProvider>
  );
}
