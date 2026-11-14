import { notFound } from "next/navigation";
import { LandingPageList } from "@/components/builder/LandingPageList";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { starterDraft } from "@/components/builder/server-pages";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";
import { loadOwnShop } from "@/lib/own-shop";
import { ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { ownPageList } from "@/lib/own-site";
import { fetchAll } from "@/lib/shop-data";

// The shop owner's landing pages (up to MAX_LANDING_PAGES_PER_SHOP, one public at a time). Each is edited at /shopowner/site/{pageId}.
export default async function LandingPagesPage() {
  // only the sessions still to come count for the checklist (not every running session ever made)
  const [shop, list, sessionList] = await Promise.all([loadOwnShop(), ownWorkshops(), fetchAll<Parameters<typeof toSession>[0]>(`/sessions?status=RUNNING&from=${encodeURIComponent(new Date().toISOString())}`)]);
  if (!shop) notFound();
  const server = await ownPageList(shop);
  const starter = starterDraft(shop, "classic");
  return (
    <LandingPageList
      server={server}
      mainPage={{ name: shop.name, template: "classic" }}
      shopHost={shop.customDomain && shop.customDomainVerified ? shop.customDomain : `${shop.slug}.${PLATFORM_DOMAIN}`}
      shop={{ name: shop.name, defaultLocale: shop.defaultLocale, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone }}
      shopStatus={shop.status}
      upcomingWorkshopCount={countWorkshopsWithUpcomingSessions(list, sessionList.map(toSession))}
      sample={{ content: starter.content, theme: starter.theme }}
    />
  );
}
