// SERVER-ONLY: the own domain of a shop (shop.example.com) until apps/api exists: the landing page is then served at that domain instead of {slug}.{PLATFORM_DOMAIN}, which keeps working.
// Lives on globalThis (like the other mock stores) so the proxy, which is a separate bundle, reads the very same data. It holds slug -> domain and imports nothing heavy for that reason.
// TODO(api): `organizations.custom_domain` (unique), the check that the DNS record points at the platform (CNAME to {slug}.{PLATFORM_DOMAIN}), the certificate for the domain (Caddy on-demand
// TLS, asked first which domains it may issue for), redirect of {slug}.{PLATFORM_DOMAIN} to the domain when the owner wants it, audit.
import { checkCustomDomain } from "@workshop/shared";
import { PLATFORM_DOMAIN, siteOrigin } from "@/components/site/site-url";

const g = globalThis as unknown as { __shopDomains?: Map<string, string> };
const domains = () => (g.__shopDomains ??= new Map<string, string>());

/** Test helper: no shop has an own domain. */
export function resetShopDomainStore(): void {
  g.__shopDomains = new Map();
}

/** The own domain of the shop, or "" when it has none. */
export const getCustomDomain = (slug: string): string => domains().get(slug) ?? "";

/** The slug of the shop that has this host as its own domain (the host without a port, any case), or undefined. */
export function slugForDomain(host: string): string | undefined {
  const h = host.trim().toLowerCase().replace(/:\d{1,5}$/, "");
  for (const [slug, domain] of domains()) if (domain === h) return slug;
  return undefined;
}

/** The address of the landing page of the shop: its own domain when it has one, else {slug}.{PLATFORM_DOMAIN} (http in dev, https otherwise, like siteOrigin). */
export function shopOrigin(slug: string): string {
  const domain = getCustomDomain(slug);
  if (!domain) return siteOrigin(slug);
  return siteOrigin(slug).startsWith("http:") ? `http://${domain}` : `https://${domain}`;
}

export type SetDomainResult = { ok: true; domain: string; changed: boolean } | { ok: false; code: "INVALID" | "PLATFORM" | "TAKEN" };

/** Saves what the owner typed for the shop: cleaned and checked (an empty value removes the domain); a domain another shop has is refused. */
export function setCustomDomain(slug: string, input: string, platformDomain: string = PLATFORM_DOMAIN): SetDomainResult {
  const checked = checkCustomDomain(input, platformDomain);
  if (!checked.ok) return { ok: false, code: checked.error };
  const before = getCustomDomain(slug);
  if (checked.domain === "") {
    domains().delete(slug);
    return { ok: true, domain: "", changed: before !== "" };
  }
  const owner = slugForDomain(checked.domain);
  if (owner && owner !== slug) return { ok: false, code: "TAKEN" };
  domains().set(slug, checked.domain);
  return { ok: true, domain: checked.domain, changed: before !== checked.domain };
}
