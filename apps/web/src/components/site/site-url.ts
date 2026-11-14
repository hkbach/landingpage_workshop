export const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "localtest.me";

/** Absolute origin of a shop site, e.g. https://whiskladle.example.com (http for localtest.me in dev). */
export function siteOrigin(slug: string): string {
  const proto = PLATFORM_DOMAIN === "localtest.me" || PLATFORM_DOMAIN.startsWith("localhost") ? "http" : "https";
  return `${proto}://${slug}.${PLATFORM_DOMAIN}`;
}

const isDev = PLATFORM_DOMAIN === "localtest.me" || PLATFORM_DOMAIN.startsWith("localhost");

/**
 * The address of the platform (`app.{PLATFORM_DOMAIN}`) as seen from the host a shop page is served on: the dev port of a platform host is kept (localtest.me:3000), a shop's own domain has none.
 * The login of a customer lives there (the session cookie is only for that host).
 */
export function appOrigin(host: string): string {
  const [name = "", port = ""] = host.toLowerCase().split(":");
  const onPlatform = name === PLATFORM_DOMAIN || name.endsWith(`.${PLATFORM_DOMAIN}`) || name === "localhost";
  return `${isDev ? "http" : "https"}://app.${PLATFORM_DOMAIN}${onPlatform && port ? `:${port}` : ""}`;
}

/** The two addresses behind the Log in and Register buttons of a shop page: the popups of the platform, the register one for a customer only (no shop owner tab). */
export function accountLinks(host: string): { login: string; signup: string } {
  const origin = appOrigin(host);
  return { login: `${origin}/?auth=login`, signup: `${origin}/?auth=signup&only=customer` };
}

/** Path of a locale page relative to a site base ("" on the subdomain host, "/sites/{slug}" on the fallback host). */
export function localePath(base: string, locale: string, defaultLocale: string): string {
  return locale === defaultLocale ? base || "/" : `${base}/${locale}`;
}
