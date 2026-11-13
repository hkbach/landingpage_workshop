import { notFound } from "next/navigation";
import type { Locale } from "@workshop/shared";
import { loadPublicSite, type LoadedSite } from "@/lib/public-site";

/** Shop by slug, or 404 for unknown / non-ACTIVE / SUSPENDED shops. */
export async function requireSite(slug: string): Promise<LoadedSite> {
  const site = await loadPublicSite(slug);
  if (!site) notFound();
  return site;
}

/** First segment is a locale only if enabled for the shop; the default locale lives at the root; anything else is 404. */
export function resolveLocale(site: Pick<LoadedSite, "shop">, segments: string[] | undefined): Locale {
  if (!segments || segments.length === 0) return site.shop.defaultLocale;
  if (segments.length > 1) notFound();
  const candidate = segments[0]!;
  const match = site.shop.enabledLocales.find((l) => l === candidate);
  if (!match) notFound();
  return match;
}
