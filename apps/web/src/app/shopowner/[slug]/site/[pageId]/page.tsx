import { ORG_STATUSES, type OrgStatus } from "@workshop/shared";
import { isTemplateKey } from "@/components/sections/templates";
import { SiteBuilder } from "@/components/builder/SiteBuilder";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { currentShop, mockLandingPages, sessions, sitePage, workshops } from "@/lib/mock/data";
import { liveShop } from "@/lib/mock/shop-admin-store";
import { getPlatformSupport } from "@/lib/mock/platform";

// Frontend-only: mock draft + shop. `?status=DRAFT|ACTIVE|SUSPENDED` previews the publish states.
export default async function SiteBuilderPage({ params, searchParams }: PageProps<"/shopowner/[slug]/site/[pageId]">) {
  const { pageId } = await params;
  const sp = await searchParams;
  const requested = typeof sp.status === "string" ? sp.status : undefined;
  const status: OrgStatus = (ORG_STATUSES as readonly string[]).includes(requested ?? "") ? (requested as OrgStatus) : (liveShop(currentShop.id) ?? currentShop).status;
  // ?apply=KEY (from the template preview banner) opens the "Switch template?" confirmation for that template.
  const apply = typeof sp.apply === "string" && isTemplateKey(sp.apply) ? sp.apply : undefined;
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
