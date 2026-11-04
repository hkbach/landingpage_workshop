export const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "localtest.me";

/** Absolute origin of a shop site, e.g. https://whiskladle.example.com (http for localtest.me in dev). */
export function siteOrigin(slug: string): string {
  const proto = PLATFORM_DOMAIN === "localtest.me" || PLATFORM_DOMAIN.startsWith("localhost") ? "http" : "https";
  return `${proto}://${slug}.${PLATFORM_DOMAIN}`;
}

/** Path of a locale page relative to a site base ("" on the subdomain host, "/sites/{slug}" on the fallback host). */
export function localePath(base: string, locale: string, defaultLocale: string): string {
  return locale === defaultLocale ? base || "/" : `${base}/${locale}`;
}
