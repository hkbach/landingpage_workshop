import { notFound } from "next/navigation";
import { loadMessages } from "@/i18n/messages";
import { isTemplateKey } from "@/components/sections/templates";
import { SitePreview } from "@/components/builder/SitePreview";
import { draftOf, starterDraft } from "@/components/builder/server-pages";
import { loadOwnShop } from "@/lib/own-shop";
import { ownPromotions, ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { ownPageDetail } from "@/lib/own-site";
import { fetchAll } from "@/lib/shop-data";

// Preview of the DRAFT with the same PageRenderer as the public site (FR-SITE-03). Dashboard-only route.
export default async function SitePreviewPage({ searchParams }: PageProps<"/shopowner/[slug]/site/preview">) {
  const sp = await searchParams;
  const pageId = typeof sp.page === "string" && /^[a-z0-9-]{1,40}$/.test(sp.page) ? sp.page : undefined;
  const template = typeof sp.template === "string" && isTemplateKey(sp.template) ? sp.template : undefined;
  const shop = await loadOwnShop();
  if (!shop) notFound();
  const detail = pageId ? await ownPageDetail(pageId) : null;
  const draft = detail ? draftOf(detail, shop) : starterDraft(shop, "classic");
  const [list, sessionList, promo, messages] = await Promise.all([
    ownWorkshops(), fetchAll<Parameters<typeof toSession>[0]>("/sessions"), ownPromotions(shop.timezone),
    Promise.all(shop.enabledLocales.map(async (l) => [l, (await loadMessages(l)).site as Record<string, unknown>] as const)),
  ]);
  const active = list.filter((w) => w.status === "ACTIVE");
  return (
    <SitePreview
      shop={{ name: shop.name, slug: shop.slug, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, timezone: shop.timezone, currency: shop.currency }}
      initial={draft} serverDraft={draft}
      workshops={active} sessions={sessionList.map(toSession).filter((s) => active.some((w) => w.id === s.workshopId))}
      promotions={promo.promotions} siteMessages={Object.fromEntries(messages)} previewTemplate={template} pageId={pageId}
    />
  );
}
