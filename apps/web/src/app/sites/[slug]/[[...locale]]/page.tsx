import type { Metadata } from "next";
import { pickLocalized } from "@workshop/shared";
import { SiteBody } from "@/components/site/SiteBody";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { getSiteBase } from "@/components/site/site-base";
import { localePath, siteOrigin } from "@/components/site/site-url";
import { requireSite, resolveLocale } from "@/components/site/resolve";
import { safeImage } from "@/components/sections/safe-url";
import type { PageContent } from "@/lib/types";
import type { RenderContext } from "@/components/sections/context";

function heroImage(content: PageContent): string | undefined {
  const hero = content.sections.find((s) => s.type === "hero" && s.enabled);
  return safeImage(hero?.props.imageUrl);
}

export async function generateMetadata({ params }: PageProps<"/sites/[slug]/[[...locale]]">): Promise<Metadata> {
  const { slug, locale: segs } = await params;
  const site = requireSite(slug);
  const locale = resolveLocale(site, segs);
  const { shop, content } = site;
  const origin = siteOrigin(slug);
  const title = pickLocalized(content.seo.title, locale, shop.defaultLocale) || shop.name;
  const description = pickLocalized(content.seo.description, locale, shop.defaultLocale);
  const image = heroImage(content);
  const languages: Record<string, string> = Object.fromEntries(
    shop.enabledLocales.map((l) => [l, origin + localePath("", l, shop.defaultLocale)]),
  );
  languages["x-default"] = origin + "/";
  return {
    title,
    description,
    metadataBase: new URL(origin),
    alternates: { canonical: origin + localePath("", locale, shop.defaultLocale), languages },
    openGraph: { title, description, type: "website", url: origin + localePath("", locale, shop.defaultLocale), siteName: shop.name, ...(image ? { images: [image] } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description },
  };
}

export default async function SitePage({ params }: PageProps<"/sites/[slug]/[[...locale]]">) {
  const { slug, locale: segs } = await params;
  const site = requireSite(slug);
  const locale = resolveLocale(site, segs);
  const base = await getSiteBase(slug);
  const { shop, content, theme, workshops, sessions } = site;

  const ctx: RenderContext = {
    locale,
    shop: { name: shop.name, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, timezone: shop.timezone, currency: shop.currency },
    workshops,
    reportHref: `${base}/report`,
    privacyHref: "#privacy", // placeholder until the legal pages exist
  };
  const languages = shop.enabledLocales.map((l) => ({ locale: l, href: localePath(base, l, shop.defaultLocale) }));

  return (
    <SiteIntlProvider locale={locale}>
      <SiteFrame theme={theme} locale={locale}>
        <SiteHeader
          shopName={shop.name} logoUrl={theme.logoUrl} locale={locale} languages={languages}
          homeHref={localePath(base, locale, shop.defaultLocale)}
        />
        <SiteBody
          content={content} theme={theme} ctx={ctx} workshops={workshops} sessions={sessions} locale={locale} basePath={base}
          shop={{ name: shop.name, slug: shop.slug, timezone: shop.timezone, currency: shop.currency, defaultLocale: shop.defaultLocale, bookingCutoffMinutes: shop.bookingCutoffMinutes }}
        />
      </SiteFrame>
    </SiteIntlProvider>
  );
}
