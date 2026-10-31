import { ORG_STATUSES, type OrgStatus } from "@workshop/shared";
import { SiteBuilder } from "@/components/builder/SiteBuilder";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { currentShop, sessions, sitePage, workshops } from "@/lib/mock/data";

// Frontend-only: mock draft + shop. `?status=DRAFT|PENDING_REVIEW|ACTIVE|SUSPENDED` previews the submit/publish states.
export default async function SiteBuilderPage({ searchParams }: PageProps<"/dashboard/site">) {
  const sp = await searchParams;
  const requested = typeof sp.status === "string" ? sp.status : undefined;
  const status: OrgStatus = (ORG_STATUSES as readonly string[]).includes(requested ?? "") ? (requested as OrgStatus) : currentShop.status;
  return (
    <SiteBuilder
      shop={{
        name: currentShop.name, defaultLocale: currentShop.defaultLocale, enabledLocales: currentShop.enabledLocales,
        contactEmail: currentShop.contactEmail, contactPhone: currentShop.contactPhone,
      }}
      initial={{ content: sitePage.draft, theme: sitePage.theme }}
      initialStatus={status}
      upcomingWorkshopCount={countWorkshopsWithUpcomingSessions(workshops, sessions)}
    />
  );
}
