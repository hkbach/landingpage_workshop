import { hreflangOf } from "@workshop/shared";
import { getPublicSite } from "@/lib/mock/site";
import { localePath, siteOrigin } from "@/components/site/site-url";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Per-host sitemap with hreflang alternates for each enabled locale (FR-SITE-05).
export async function GET(_req: Request, ctx: RouteContext<"/sites/[slug]/sitemap.xml">) {
  const { slug } = await ctx.params;
  const site = getPublicSite(slug);
  if (!site) return new Response("Not found", { status: 404 });
  const { shop } = site;
  const origin = siteOrigin(slug);
  const alternates = (): string =>
    shop.enabledLocales
      .map((l) => `<xhtml:link rel="alternate" hreflang="${hreflangOf(l)}" href="${esc(origin + localePath("", l, shop.defaultLocale))}"/>`)
      .join("");
  const urls = shop.enabledLocales
    .map((l) => `<url><loc>${esc(origin + localePath("", l, shop.defaultLocale))}</loc>${alternates()}</url>`)
    .join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
