import { notFound } from "next/navigation";
import { ORG_STATUSES, type OrgStatus } from "@workshop/shared";
import { isTemplateKey } from "@/components/sections/templates";
import { SiteBuilder } from "@/components/builder/SiteBuilder";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { draftOf, pageMetaOf, type ServerPage } from "@/components/builder/server-pages";
import { currentShop, mockLandingPages, sessions, sitePage, workshops } from "@/lib/mock/data";
import { liveShop } from "@/lib/mock/shop-admin-store";
import { apiGet, realApi } from "@/lib/api-server";
import { loadOwnShop, loadSupport } from "@/lib/own-shop";
import { ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { ownPageDetail } from "@/lib/own-site";
import { fetchAll } from "@/lib/shop-data";
import { getPlatformSupport } from "@/lib/mock/platform";

// Connected to the API: the page, its draft and the live page are the server's. Sample data: mock draft + shop. `?status=DRAFT|ACTIVE|SUSPENDED` previews the publish states there.
export default async function SiteBuilderPage({ params, searchParams }: PageProps<"/shopowner/[slug]/site/[pageId]">) {
  const { pageId } = await params;
  const sp = await searchParams;
  // ?apply=KEY (from the template preview banner) opens the "Switch template?" confirmation for that template.
  const apply = typeof sp.apply === "string" && isTemplateKey(sp.apply) ? sp.apply : undefined;
  if (realApi()) {
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
  const requested = typeof sp.status === "string" ? sp.status : undefined;
  const status: OrgStatus = (ORG_STATUSES as readonly string[]).includes(requested ?? "") ? (requested as OrgStatus) : (liveShop(currentShop.id) ?? currentShop).status;
  return (
    <SiteBuilder
      pageId={pageId}
      mainPage={{ name: currentShop.name, template: sitePage.template, seed: mockLandingPages }}
      shop={{
        name: currentShop.name, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales,
        contactEmail: currentShop.contactEmail, contactPhone: currentShop.contactPhone,
      }}
      initial={{ content: sitePage.draft, theme: sitePage.theme, template: sitePage.template }}
      // A shop that is already live has a published version: it is shown when there is no saved draft.
      initialSource={status === "ACTIVE" ? "published" : "starter"}
      initialStatus={status}
      applyTemplate={apply}
      upcomingWorkshopCount={countWorkshopsWithUpcomingSessions(workshops, sessions)}
      support={getPlatformSupport()}
    />
  );
}
