import { apiGet } from "@/lib/api-server";
import type { ListedShop } from "@/lib/listing-types";
import { loadPublicSite } from "@/lib/public-site";

// What the customer area needs from the API (the account of the session). Only called when connected.

type Card = { id: string; shop: { name: string; slug: string } };

/**
 * The shops the platform chose to list, each with what its landing page shows (theme, workshops, sessions, promotions): the Workshops, Favorites and Affiliate pages. The API gives the
 * workshop cards of the shops that are listed; the site of each of those shops comes from the public API. Every shop is bookable.
 */
export async function loadListedShops(accountId: string): Promise<ListedShop[]> {
  const cards = (await apiGet<{ items: Card[] }>(`/customer/${encodeURIComponent(accountId)}/workshops`))?.items ?? [];
  const slugs = [...new Set(cards.map((c) => c.shop.slug))];
  const sites = await Promise.all(slugs.map((slug) => loadPublicSite(slug)));
  return sites
    // (the sections of each landing page are dropped: the customer area never shows them, and they would be sent to the browser with every shop)
    .flatMap((site): ListedShop[] => (site ? [{ ...site, content: { ...site.content, sections: [] }, bookable: true }] : []))
    .sort((a, b) => a.shop.name.localeCompare(b.shop.name));
}

/** The ids of the workshops the customer saved as favorites (kept by the server). */
export async function loadFavoriteIds(accountId: string): Promise<string[]> {
  return ((await apiGet<{ items: Card[] }>(`/customer/${encodeURIComponent(accountId)}/favorites`))?.items ?? []).map((c) => c.id);
}
