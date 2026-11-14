"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { hashText, rankWorkshops, workshopDirectionsUrl, type Locale } from "@workshop/shared";
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
import type { ListedShop } from "@/lib/listing-types";
import { cn } from "@/lib/utils";
import { GoogleMapsButton } from "./google-maps-button";
import { AffiliateAction, AffiliateFeeLine } from "./customer-affiliate";
import { RatingStars } from "./rating-stars";
import { useCustomer } from "./customer-shell";

/**
 * The Workshops page of the guest area: the workshops of every shop the platform administrator chose to list, in one list. Each card is the one of the landing page of
 * its shop (its theme, Book button and booking popup; the booking is made at that shop) with the name of the shop and the rating under the name of the workshop. The
 * guest can search by the name of a workshop or of a shop. A shop's booking popup and favorites are shared by its cards (they belong to a shop).
 * The order of the Workshops page is made for the guest (`rankWorkshops`): the workshops that share the most categories with their favorite categories come first, and the shops take turns
 * in each group (the shop that leads rotates every day and is not the same for every guest), so no shop is always on top whatever the date it was created.
 * The Favorites page is the same page with only the workshops the guest added to their favorites (`mode="favorites"`): taking the heart off a card takes it away at once.
 * The Program tab of the Affiliate page (`mode="affiliate"`) lists the active workshops with the affiliate fee of their shop, without the Book and Google Maps buttons; a card has
 * Register Affiliate, which is replaced for good by Copy Affiliate link once the guest is registered for that workshop (the link opens its booking at the shop).
 */
export function CustomerWorkshops({ shops, mode = "all", serverFavorites }: {
  shops: ListedShop[]; mode?: "all" | "favorites" | "affiliate";
  /** Connected to the API: the ids of the favorites as the server has them (a heart saves or removes on the server). Not given: the favorites are kept in the browser. */
  serverFavorites?: string[];
}) {
  const t = useTranslations("customer");
  const locale = useLocale() as Locale;
  const { profile } = useCustomer();
  const [query, setQuery] = useState("");
  const router = useRouter();
  const server = useMemo(() => (serverFavorites ? {
    ids: serverFavorites,
    toggle: (workshopId: string) => {
      const on = serverFavorites.includes(workshopId);
      void fetch(`/api/v1/customer/${encodeURIComponent(profile.id)}/favorites/${encodeURIComponent(workshopId)}`, { method: on ? "DELETE" : "PUT" }).finally(() => router.refresh());
    },
  } : undefined), [serverFavorites, profile.id, router]);

  // The guest is known here: the hearts of a shop are the hearts of this account, without asking for the login again.
  useEffect(() => {
    if (serverFavorites) return; // (connected: the account is the session, the browser keeps nothing)
    for (const s of shops) if (readGuestEmail(s.shop.slug) !== normalizeGuestEmail(profile.email)) writeGuestEmail(s.shop.slug, profile.email);
  }, [shops, profile.email, serverFavorites]);

  // The workshops this account added to its favorites, shop by shop (kept in the browser, see lib/favorites.ts); the snapshot is one text so it can be compared.
  const savedSnapshot = useSyncExternalStore(subscribeFavorites, () => JSON.stringify(shops.map((s) => readFavoritesRaw(s.shop.slug, normalizeGuestEmail(profile.email)))), () => "[]");
  const saved = useMemo(() => {
    const raws = JSON.parse(savedSnapshot) as string[];
    return new Map(shops.map((s, i) => [s.shop.id, serverFavorites ? new Set(s.workshops.filter((w) => serverFavorites.includes(w.id)).map((w) => w.id)) : new Set(parseFavorites(raws[i]))]));
  }, [shops, savedSnapshot, serverFavorites]);

  // The workshops of the page (all of them, or the favorites), shop by shop.
  const pool = useMemo(
    () => shops.map((s) => ({ ...s, list: [...s.workshops].sort((a, b) => a.sortOrder - b.sortOrder).filter((w) => mode !== "favorites" || saved.get(s.shop.id)?.has(w.id)) })),
    [shops, mode, saved],
  );
  // The order of the Workshops page: by what the guest likes, the shops taking turns. The seed is the day mixed with the guest, taken once for the visit (so the page does not reshuffle
  // while the guest searches or hearts a workshop): it changes every day and differs from guest to guest. The other pages keep the order shop by shop.
  const [visitAt] = useState(() => Date.now());
  const seed = Math.floor(visitAt / 86_400_000) + hashText(profile.id);
  const favoriteCategories = profile.account.favoriteCategories;
  // What the search leaves, in that order (the order is made on all the workshops, so a search does not change it).
  const cards = useMemo(() => {
    const flat = pool.flatMap((s) => s.list.map((w) => ({ s, w, id: w.id, shopId: s.shop.id, categories: w.categories ?? [] })));
    return (mode === "all" ? rankWorkshops(flat, favoriteCategories, seed) : flat).filter(({ s, w }) => workshopMatches(w, s.shop.name, query));
  }, [pool, mode, favoriteCategories, seed, query]);
  const total = cards.length;
  const nothingToShow = pool.every((s) => s.list.length === 0); // no workshop listed, or no favorite yet

  return (
    <div className="grid gap-4">
      {mode === "affiliate" ? null : <h1 className="text-2xl font-semibold">{t(mode === "favorites" ? "menu.favorites" : "menu.workshops")}</h1>}
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
            {cards.map(({ s: { shop, theme, workshops, sessions, promotions, bookable, list }, w }) => {
              const base = `/sites/${shop.slug}`;
              const ctx: RenderContext = {
                locale, workshops: list, promotions, reportHref: `${base}/report`, privacyHref: "#privacy",
                shop: { name: shop.name, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, timezone: shop.timezone, currency: shop.currency },
              };
              return (
                // Each card sits in the popup (with all the workshops of its shop) and the favorites of ITS shop, so cards of different shops can follow each other in the one
                // list; they add no element of their own, so the cards stay items of the list.
                <BookingProvider
                  key={`${shop.id}:${w.id}`} shop={{ name: shop.name, slug: shop.slug, timezone: shop.timezone, currency: shop.currency, defaultLocale: shop.defaultLocale }}
                  workshops={workshops} sessions={sessions} theme={theme} locale={locale} basePath={base} promotions={promotions} preview={!bookable}
                  guest={{ fullName: profile.fullName, email: profile.email, phone: profile.phone, country: profile.account.country }}
                >
                  <FavoritesProvider slug={shop.slug} shopName={shop.name} theme={theme} {...(server ? { server } : {})}>
                      {/* The theme of the shop (colours, radius, font) as on its landing page; the card sizes itself from this box. */}
                      <li key={w.id} style={themeStyle(theme)} lang={locale} className={cn("@container h-full overflow-hidden rounded-xl", siteFontClass(theme.font))} data-testid={`customer-workshop-${w.id}`}>
                        <WorkshopCard
                          w={w} ctx={ctx} as="div" className="flex h-full flex-col" showBook={mode !== "affiliate"}
                          // Google Maps beside Book: the map link of the shop for the shop's address, a search for an address of the workshop's own.
                          actions={(() => {
                            const maps = safeMaps(workshopDirectionsUrl({ address: w.address }, shop));
                            // The Affiliate page has no Book and no Google Maps button: only the affiliate button.
                            if (mode === "affiliate") return <AffiliateAction workshopId={w.id} />;
                            return maps ? <GoogleMapsButton href={maps} testId="customer-workshop-map" /> : null;
                          })()}
                          meta={(
                            <div className="grid gap-1">
                              <p className="text-sm text-[var(--site-muted)]" data-testid="customer-workshop-shop">{t("workshops.shopLine", { shop: shop.name })}</p>
                              {w.rating ? <RatingStars average={w.rating.average} count={w.rating.count} /> : <p className="text-xs text-[var(--site-muted)]" data-testid="customer-workshop-no-rating">{t("workshops.noRating")}</p>}
                              {mode === "affiliate" ? <AffiliateFeeLine workshopId={w.id} /> : null}
                            </div>
                          )}
                        />
                      </li>
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
