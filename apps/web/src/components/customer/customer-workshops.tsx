"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { workshopDirectionsUrl, type Locale } from "@workshop/shared";
import { BookingProvider } from "@/components/booking/BookingProvider";
import type { RenderContext } from "@/components/sections/context";
import { WorkshopCard } from "@/components/sections/renderers";
import { safeMaps } from "@/components/sections/safe-url";
import { siteFontClass } from "@/components/sections/site-fonts";
import { themeStyle } from "@/components/sections/theme";
import { FavoritesProvider } from "@/components/site/FavoritesProvider";
import { Input } from "@/components/ui/input";
import { workshopMatches } from "@/lib/customer-workshop-search";
import { normalizeGuestEmail, parseFavorites, readFavoritesRaw, readGuestEmail, subscribeFavorites, writeGuestEmail } from "@/lib/favorites";
import type { ListedShop } from "@/lib/mock/customer-listing";
import { cn } from "@/lib/utils";
import { GoogleMapsButton } from "./google-maps-button";
import { RatingStars } from "./rating-stars";
import { useCustomer } from "./customer-shell";

/**
 * The Workshops page of the guest area: the workshops of every shop the platform administrator chose to list, in one list. Each card is the one of the landing page of
 * its shop (its theme, Book button and booking popup; the booking is made at that shop) with the name of the shop and the rating under the name of the workshop. The
 * guest can search by the name of a workshop or of a shop. A shop's booking popup and favorites are shared by its cards (they belong to a shop).
 * The Favorites page is the same page with only the workshops the guest added to their favorites (`mode="favorites"`): taking the heart off a card takes it away at once.
 */
export function CustomerWorkshops({ shops, mode = "all" }: { shops: ListedShop[]; mode?: "all" | "favorites" }) {
  const t = useTranslations("customer");
  const locale = useLocale() as Locale;
  const { profile } = useCustomer();
  const [query, setQuery] = useState("");

  // The guest is known here: the hearts of a shop are the hearts of this account, without asking for the login again.
  useEffect(() => {
    for (const s of shops) if (readGuestEmail(s.shop.slug) !== normalizeGuestEmail(profile.email)) writeGuestEmail(s.shop.slug, profile.email);
  }, [shops, profile.email]);

  // The workshops this account added to its favorites, shop by shop (kept in the browser, see lib/favorites.ts); the snapshot is one text so it can be compared.
  const savedSnapshot = useSyncExternalStore(subscribeFavorites, () => JSON.stringify(shops.map((s) => readFavoritesRaw(s.shop.slug, normalizeGuestEmail(profile.email)))), () => "[]");
  const saved = useMemo(() => {
    const raws = JSON.parse(savedSnapshot) as string[];
    return new Map(shops.map((s, i) => [s.shop.id, new Set(parseFavorites(raws[i]))]));
  }, [shops, savedSnapshot]);

  // The workshops of the page (all of them, or the favorites), then what the search leaves, shop by shop (the shops keep their order; a shop with nothing left is not there).
  const pool = shops.map((s) => ({ ...s, list: [...s.workshops].sort((a, b) => a.sortOrder - b.sortOrder).filter((w) => mode === "all" || saved.get(s.shop.id)?.has(w.id)) }));
  const found = pool.map((s) => ({ ...s, list: s.list.filter((w) => workshopMatches(w, s.shop.name, query)) })).filter((s) => s.list.length > 0);
  const total = found.reduce((n, s) => n + s.list.length, 0);
  const nothingToShow = pool.every((s) => s.list.length === 0); // no workshop listed, or no favorite yet

  return (
    <div className="grid gap-4">
      <h1 className="text-2xl font-semibold">{t(mode === "favorites" ? "menu.favorites" : "menu.workshops")}</h1>
      {nothingToShow ? <p className="text-sm text-muted-foreground" data-testid="customer-workshops-empty">{t(mode === "favorites" && shops.length > 0 ? "favorites.empty" : "workshops.empty")}</p> : (
        <>
          <div className="grid gap-1.5">
            <label htmlFor="cw-search" className="text-sm font-medium">{t("workshops.searchLabel")}</label>
            <div className="relative max-w-md">
              <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="cw-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("workshops.searchPlaceholder")} autoComplete="off" className="ps-8" aria-controls="cw-list" />
            </div>
          </div>
          {shops.some((s) => !s.bookable) ? <p className="text-xs text-muted-foreground" data-testid="customer-shop-demo-note">{t("workshops.demoOnly")}</p> : null}
          <p role="status" className="text-sm text-muted-foreground" data-testid="customer-workshops-count">{t("workshops.count", { count: total })}</p>
          {total === 0 ? <p className="text-sm" data-testid="customer-workshops-none">{t("workshops.noResults", { query: query.trim() })}</p> : null}
          <ul id="cw-list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="customer-workshop-list">
            {found.map(({ shop, theme, workshops, sessions, promotions, bookable, list }) => {
              const base = `/sites/${shop.slug}`;
              const ctx: RenderContext = {
                locale, workshops: list, promotions, reportHref: `${base}/report`, privacyHref: "#privacy",
                shop: { name: shop.name, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, timezone: shop.timezone, currency: shop.currency },
              };
              return (
                // One popup (with all the workshops of the shop, whatever the search leaves) and one favorites list for the cards of a shop; they add no element of
                // their own, so the cards stay items of the one list.
                <BookingProvider
                  key={shop.id} shop={{ name: shop.name, slug: shop.slug, timezone: shop.timezone, currency: shop.currency, defaultLocale: shop.defaultLocale }}
                  workshops={workshops} sessions={sessions} theme={theme} locale={locale} basePath={base} promotions={promotions} preview={!bookable}
                  guest={{ fullName: profile.fullName, email: profile.email, phone: profile.phone, country: profile.account.country }}
                >
                  <FavoritesProvider slug={shop.slug} shopName={shop.name} theme={theme}>
                    {list.map((w) => (
                      // The theme of the shop (colours, radius, font) as on its landing page; the card sizes itself from this box.
                      <li key={w.id} style={themeStyle(theme)} lang={locale} className={cn("@container h-full overflow-hidden rounded-xl", siteFontClass(theme.font))} data-testid={`customer-workshop-${w.id}`}>
                        <WorkshopCard
                          w={w} ctx={ctx} as="div" className="flex h-full flex-col"
                          // Google Maps beside Book: the map link of the shop for the shop's address, a search for an address of the workshop's own.
                          actions={(() => {
                            const maps = safeMaps(workshopDirectionsUrl({ address: w.address }, shop));
                            return maps ? <GoogleMapsButton href={maps} testId="customer-workshop-map" /> : null;
                          })()}
                          meta={(
                            <div className="grid gap-1">
                              <p className="text-sm text-[var(--site-muted)]" data-testid="customer-workshop-shop">{t("workshops.shopLine", { shop: shop.name })}</p>
                              {w.rating ? <RatingStars average={w.rating.average} count={w.rating.count} /> : <p className="text-xs text-[var(--site-muted)]" data-testid="customer-workshop-no-rating">{t("workshops.noRating")}</p>}
                            </div>
                          )}
                        />
                      </li>
                    ))}
                  </FavoritesProvider>
                </BookingProvider>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
