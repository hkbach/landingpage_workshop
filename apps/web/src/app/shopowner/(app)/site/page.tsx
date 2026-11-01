import { LandingPageList } from "@/components/builder/LandingPageList";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";
import { currentShop, shops, sitePage } from "@/lib/mock/data";

// The shop owner's landing pages (up to MAX_LANDING_PAGES_PER_SHOP). Each one is edited at /shopowner/site/{pageId}.
export default function LandingPagesPage() {
  return (
    <LandingPageList
      mainPage={{ name: currentShop.name, slug: currentShop.slug, template: sitePage.template }}
      takenSlugs={shops.filter((s) => s.id !== currentShop.id).map((s) => s.slug)}
      platformDomain={PLATFORM_DOMAIN}
      mainLive={currentShop.status === "ACTIVE"}
    />
  );
}
