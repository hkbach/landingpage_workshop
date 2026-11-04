"use client";

import { useEffect } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ExternalLink } from "lucide-react";
import type { Locale } from "@workshop/shared";
import { BookingProvider } from "@/components/booking/BookingProvider";
import type { RenderContext } from "@/components/sections/context";
import { WorkshopCard } from "@/components/sections/renderers";
import { siteFontClass } from "@/components/sections/site-fonts";
import { themeStyle } from "@/components/sections/theme";
import { FavoritesProvider } from "@/components/site/FavoritesProvider";
import { readGuestEmail, writeGuestEmail } from "@/lib/favorites";
import type { ListedShop } from "@/lib/mock/customer-listing";
import { cn } from "@/lib/utils";
import { useCustomer } from "./customer-shell";

/**
 * The Workshops page of the guest area: the workshops of every shop the platform administrator chose to list, each shop in its own theme, with the same cards,
 * Book button and booking popup as its landing page (the booking is made at that shop). Each shop has its own booking popup and favorites (they belong to a shop).
 */
export function CustomerWorkshops({ shops }: { shops: ListedShop[] }) {
  const t = useTranslations("customer");
  const locale = useLocale() as Locale;
  const { profile } = useCustomer();

  // The guest is known here: the hearts of a shop are theirs without asking for the login again (what a login already stored is kept).
  useEffect(() => {
    for (const s of shops) if (!readGuestEmail(s.shop.slug)) writeGuestEmail(s.shop.slug, profile.email);
  }, [shops, profile.email]);

  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold">{t("menu.workshops")}</h1>
      {shops.length === 0 ? <p className="text-sm text-muted-foreground" data-testid="customer-workshops-empty">{t("workshops.empty")}</p> : null}
      {shops.map(({ shop, theme, workshops, sessions, promotions, bookable }) => {
        const base = `/sites/${shop.slug}`;
        const ctx: RenderContext = {
          locale, workshops, promotions, reportHref: `${base}/report`, privacyHref: "#privacy",
          shop: { name: shop.name, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, timezone: shop.timezone, currency: shop.currency },
        };
        const list = [...workshops].sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <section key={shop.id} aria-labelledby={`cw-${shop.slug}`} data-testid={`customer-shop-${shop.slug}`} className="grid gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 id={`cw-${shop.slug}`} className="text-lg font-semibold">{shop.name}</h2>
              <a href={base} className="inline-flex items-center gap-1 text-sm text-muted-foreground underline-offset-4 hover:underline">
                {t("workshops.visitSite", { shop: shop.name })}<ExternalLink className="size-3.5" aria-hidden />
              </a>
            </div>
            {bookable ? null : <p className="text-xs text-muted-foreground" data-testid="customer-shop-demo-note">{t("workshops.demoOnly")}</p>}
            {/* The theme of the shop (colours, radius, font) as on its landing page; the cards size themselves from this box. */}
            <div style={themeStyle(theme)} lang={locale} className={cn("@container overflow-hidden rounded-xl border", siteFontClass(theme.font))}>
              <BookingProvider
                shop={{ name: shop.name, slug: shop.slug, timezone: shop.timezone, currency: shop.currency, defaultLocale: shop.defaultLocale }}
                workshops={workshops} sessions={sessions} theme={theme} locale={locale} basePath={base} promotions={promotions} preview={!bookable}
                guest={{ fullName: profile.fullName, email: profile.email, phone: profile.phone, country: profile.account.country }}
              >
                <FavoritesProvider slug={shop.slug} shopName={shop.name} theme={theme}>
                  <ul className="grid gap-6 bg-[var(--site-bg)] p-4 text-[var(--site-text)] @xl:grid-cols-2 @5xl:grid-cols-3 @xl:p-6" data-testid="customer-workshop-list">
                    {list.map((w) => <WorkshopCard key={w.id} w={w} ctx={ctx} />)}
                  </ul>
                </FavoritesProvider>
              </BookingProvider>
            </div>
          </section>
        );
      })}
    </div>
  );
}
