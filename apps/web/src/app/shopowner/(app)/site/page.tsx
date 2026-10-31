import { ORG_STATUSES, type OrgStatus } from "@workshop/shared";
import { isTemplateKey } from "@/components/sections/templates";
import { SiteBuilder } from "@/components/builder/SiteBuilder";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { currentShop, sessions, sitePage, workshops } from "@/lib/mock/data";
import { platformSupport } from "@/lib/mock/platform";

// Frontend-only: mock draft + shop. `?status=DRAFT|PENDING_REVIEW|ACTIVE|SUSPENDED` previews the submit/publish states.
export default async function SiteBuilderPage({ searchParams }: PageProps<"/shopowner/site">) {
  const sp = await searchParams;
  const requested = typeof sp.status === "string" ? sp.status : undefined;
  const status: OrgStatus = (ORG_STATUSES as readonly string[]).includes(requested ?? "") ? (requested as OrgStatus) : currentShop.status;
  // ?apply=KEY (from the template preview banner) opens the "Switch template?" confirmation for that template.
  const apply = typeof sp.apply === "string" && isTemplateKey(sp.apply) ? sp.apply : undefined;
  return (
    <SiteBuilder
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
      support={platformSupport}
    />
  );
}
