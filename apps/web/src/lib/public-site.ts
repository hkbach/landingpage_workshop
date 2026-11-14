import type { Locale, PromotionRecord } from "@workshop/shared";
import { siteOrigin } from "@/components/site/site-url";
import { apiGet } from "@/lib/api-server";
import type { PageContent, PageTheme, Session, Shop, Workshop } from "@/lib/types";

// The landing page of a shop for a visitor (no account). Connected to the API: `GET /public/sites/{slug}` (the shop, its published page, its workshops, the running promotions) and, for each
// workshop, `GET .../availability` (the sessions a guest can see, with the seats left). The answers are mapped to the shape the pages already use.

/** What the API says about the shop that the sample data does not have; kept next to the site for the pages that need it. */
export type PublicSiteExtra = { promotions: PromotionRecord[]; customDomain: string | null };
/** What a visitor sees of a shop: the shop, its published page, theme, workshops with their sessions, and the promotions running today. */
export interface PublicSite { shop: Shop; content: PageContent; theme: PageTheme; workshops: Workshop[]; sessions: Session[] }
export type LoadedSite = PublicSite & PublicSiteExtra;

type ApiSite = {
  page: { templateKey: string; theme: PageTheme; content: PageContent; version: number; publishedAt: string | null } | null;
  shop: { name: string; slug: string; country: string; timezone: string; currency: string; defaultLocale: Locale; enabledLocales: Locale[]; contactEmail: string; contactPhone: string | null; whatsapp: string | null; address: string; mapsUrl: string | null; customDomain: string | null };
  promotions: Array<Omit<PromotionRecord, "enabled" | "createdAt" | "updatedAt" | "imageUrl"> & { imageUrl: string | null }>;
  workshops: Array<Omit<Workshop, "defaultCapacity" | "status" | "sortOrder" | "createdAt" | "address" | "addressNote" | "coverUrl" | "rating"> & { address: string; addressNote: string | null; coverUrl: string | null; rating: { average: number | null; count: number } }>;
};
type ApiAvailability = { items: Array<{ id: string; code: string; startsAt: string; endsAt: string; remaining: number; capacity: number; bookingCutoffMinutes: number; imageUrl: string | null; reason: string | null }> };

/**
 * The site of `slug`, or `null` when there is none (an unknown, not ACTIVE or suspended shop, or one that has not published a page). `sessions: false` skips the seats (one call per workshop)
 * for the routes that never show them: robots, sitemap, the report form, the booking pages.
 */
export async function loadPublicSite(slug: string, options: { sessions?: boolean } = {}): Promise<LoadedSite | null> {
  const raw = await apiGet<ApiSite>(`/public/sites/${encodeURIComponent(slug)}`);
  if (!raw || !raw.page) return null;
  const now = new Date().toISOString();
  const shop = {
    // The public answer has no id, owner or status of the shop (not for a visitor): the pages only read what a visitor may know.
    id: raw.shop.slug, name: raw.shop.name, slug: raw.shop.slug, status: "ACTIVE" as const, country: raw.shop.country, timezone: raw.shop.timezone, currency: raw.shop.currency,
    defaultLocale: raw.shop.defaultLocale, enabledLocales: raw.shop.enabledLocales, contactEmail: raw.shop.contactEmail, contactPhone: raw.shop.contactPhone ?? "",
    ...(raw.shop.whatsapp ? { whatsapp: raw.shop.whatsapp } : {}), address: raw.shop.address, mapsUrl: raw.shop.mapsUrl ?? "", ownerName: "", ownerEmail: "", createdAt: now,
  };
  const workshops: Workshop[] = raw.workshops.map((w, i) => {
    const { addressNote, coverUrl, rating, address, ...rest } = w;
    return {
      ...rest, address, coverUrl: coverUrl ?? "", defaultCapacity: 0, status: "ACTIVE", sortOrder: i, createdAt: now,
      ...(addressNote ? { addressNote } : {}), ...(rating.average !== null ? { rating: { average: rating.average, count: rating.count } } : {}),
    };
  });
  // One call per workshop (a shop has a handful): the sessions of the next 90 days.
  const lists = options.sessions === false ? [] : await Promise.all(workshops.map(async (w) => ({ w, a: await apiGet<ApiAvailability>(`/public/sites/${encodeURIComponent(slug)}/workshops/${w.id}/availability`) })));
  const sessions: Session[] = lists.flatMap(({ w, a }) =>
    (a?.items ?? []).map((s): Session => ({
      id: s.id, code: s.code, workshopId: w.id, startsAt: s.startsAt, endsAt: s.endsAt, capacity: s.capacity, reservedCount: s.capacity - s.remaining,
      status: s.reason === "CLOSED" ? "CLOSED" : "RUNNING", bookingCutoffMinutes: s.bookingCutoffMinutes, ...(s.imageUrl ? { imageUrl: s.imageUrl } : {}),
    })),
  );
  const promotions: PromotionRecord[] = raw.promotions.map(({ imageUrl, ...p }) => ({ ...p, ...(imageUrl ? { imageUrl } : {}), enabled: true, createdAt: now, updatedAt: now }));
  return { shop, content: raw.page.content, theme: raw.page.theme, workshops, sessions, promotions, customDomain: raw.shop.customDomain };
}

/** The address of the landing page of the shop: its own domain when it has a verified one, else {slug}.{PLATFORM_DOMAIN}. */
export function originOfSite(site: Pick<LoadedSite, "shop" | "customDomain">): string {
  const base = siteOrigin(site.shop.slug);
  return site.customDomain ? `${base.startsWith("http:") ? "http" : "https"}://${site.customDomain}` : base;
}
