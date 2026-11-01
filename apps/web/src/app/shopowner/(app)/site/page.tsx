import { LandingPageList } from "@/components/builder/LandingPageList";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";
import { currentShop, sessions, sitePage, workshops } from "@/lib/mock/data";

// The shop owner's landing pages (up to MAX_LANDING_PAGES_PER_SHOP, one public at a time). Each is edited at /shopowner/site/{pageId}.
export default function LandingPagesPage() {
  return (
    <LandingPageList
      mainPage={{ name: currentShop.name, template: sitePage.template }}
      shopHost={`${currentShop.slug}.${PLATFORM_DOMAIN}`}
      shop={{ name: currentShop.name, defaultLocale: currentShop.defaultLocale, contactEmail: currentShop.contactEmail, contactPhone: currentShop.contactPhone }}
      shopStatus={currentShop.status}
      upcomingWorkshopCount={countWorkshopsWithUpcomingSessions(workshops, sessions)}
      sample={{ content: sitePage.draft, theme: sitePage.theme }}
    />
  );
}
