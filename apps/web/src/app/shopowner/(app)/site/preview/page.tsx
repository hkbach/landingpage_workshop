import { loadMessages } from "@/i18n/messages";
import { isTemplateKey } from "@/components/sections/templates";
import { SitePreview } from "@/components/builder/SitePreview";
import { currentShop, sitePage, workshops } from "@/lib/mock/data";

// Preview of the DRAFT with the same PageRenderer as the public site (FR-SITE-03). Dashboard-only route.
export default async function SitePreviewPage({ searchParams }: PageProps<"/shopowner/site/preview">) {
  const sp = await searchParams;
  const template = typeof sp.template === "string" && isTemplateKey(sp.template) ? sp.template : undefined;
  const messages = await Promise.all(
    currentShop.enabledLocales.map(async (l) => [l, (await loadMessages(l)).site as Record<string, unknown>] as const),
  );
  return (
    <SitePreview
      shop={{
        name: currentShop.name, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales,
        timezone: currentShop.timezone, currency: currentShop.currency,
      }}
      initial={{ content: sitePage.draft, theme: sitePage.theme, template: sitePage.template }}
      workshops={workshops.filter((w) => w.status === "ACTIVE")}
      siteMessages={Object.fromEntries(messages)}
      previewTemplate={template}
    />
  );
}
