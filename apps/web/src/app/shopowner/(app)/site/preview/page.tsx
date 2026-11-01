import { loadMessages } from "@/i18n/messages";
import { isTemplateKey } from "@/components/sections/templates";
import { SitePreview } from "@/components/builder/SitePreview";
import { currentShop, sessions, sitePage, workshops } from "@/lib/mock/data";
import { publicPromotions } from "@/lib/mock/promotion-store";
import { bookingCutoffMinutes } from "@/lib/mock/shop-settings-store";

// Preview of the DRAFT with the same PageRenderer as the public site (FR-SITE-03). Dashboard-only route.
export default async function SitePreviewPage({ searchParams }: PageProps<"/shopowner/site/preview">) {
  const sp = await searchParams;
  const pageId = typeof sp.page === "string" && /^[a-z0-9-]{1,40}$/.test(sp.page) ? sp.page : undefined;
  const template = typeof sp.template === "string" && isTemplateKey(sp.template) ? sp.template : undefined;
  const messages = await Promise.all(
    currentShop.enabledLocales.map(async (l) => [l, (await loadMessages(l)).site as Record<string, unknown>] as const),
  );
  return (
    <SitePreview
      shop={{
        name: currentShop.name, slug: currentShop.slug, bookingCutoffMinutes: bookingCutoffMinutes(), defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales,
        timezone: currentShop.timezone, currency: currentShop.currency,
      }}
      initial={{ content: sitePage.draft, theme: sitePage.theme, template: sitePage.template }}
      workshops={workshops.filter((w) => w.status === "ACTIVE")}
      sessions={sessions.filter((s) => workshops.some((w) => w.id === s.workshopId && w.status === "ACTIVE"))}
      promotions={publicPromotions()}
      siteMessages={Object.fromEntries(messages)}
      previewTemplate={template}
      pageId={pageId}
    />
  );
}
