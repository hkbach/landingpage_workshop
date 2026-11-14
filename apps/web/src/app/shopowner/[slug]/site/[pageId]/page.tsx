import { notFound } from "next/navigation";
import { isTemplateKey } from "@/components/sections/templates";
import { SiteBuilder } from "@/components/builder/SiteBuilder";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { draftOf, pageMetaOf, type ServerPage } from "@/components/builder/server-pages";
import { apiGet } from "@/lib/api-server";
import { loadOwnShop, loadSupport } from "@/lib/own-shop";
import { ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { ownPageDetail } from "@/lib/own-site";
import { fetchAll } from "@/lib/shop-data";

// Connected to the API: the page, its draft and the live page are the server's. Sample data: mock draft + shop. `?status=DRAFT|ACTIVE|SUSPENDED` previews the publish states there.
export default async function SiteBuilderPage({ params, searchParams }: PageProps<"/shopowner/[slug]/site/[pageId]">) {
  const { pageId } = await params;
  const sp = await searchParams;
  // ?apply=KEY (from the template preview banner) opens the "Switch template?" confirmation for that template.
  const apply = typeof sp.apply === "string" && isTemplateKey(sp.apply) ? sp.apply : undefined;
  const shop = await loadOwnShop();
  const detail = shop ? await ownPageDetail(pageId) : null;
  if (!shop || !detail) notFound();
  const [list, pages, sessionList] = await Promise.all([ownWorkshops(), apiGet<{ items: ServerPage[] }>("/site/pages"), fetchAll<Parameters<typeof toSession>[0]>("/sessions?status=RUNNING")]);
  const draft = draftOf(detail, shop);
  return (
    <SiteBuilder
      pageId={pageId}
      server={{ page: pageMetaOf(detail), liveId: pages?.items.find((p) => p.isLive)?.id ?? null, source: detail.source === "DRAFT" ? "draft" : detail.source === "PUBLISHED" ? "published" : "starter" }}
      mainPage={{ name: shop.name, template: draft.template }}
      shop={{ name: shop.name, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone }}
      initial={draft}
      initialStatus={shop.status}
      applyTemplate={apply}
      upcomingWorkshopCount={countWorkshopsWithUpcomingSessions(list, sessionList.map(toSession))}
      support={await loadSupport()}
    />
  );
}
