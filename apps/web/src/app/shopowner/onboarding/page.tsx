import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { requireArea } from "@/lib/api-server";
import { OnboardingWizard } from "./onboarding-wizard";

// Standalone page (no dashboard shell): FR-ORG-01. Reached after the first login of a shop owner. The shop is the one of the session (never one named in the address).
export const dynamic = "force-dynamic";
export default async function OnboardingPage() {
  const me = await requireArea("SHOP_OWNER");
  if (!me.organization) notFound();
  const shop = { name: me.organization.name, slug: me.organization.slug, ownerEmail: me.email };
  const t = await getTranslations("dashboard.onboarding");
  const tc = await getTranslations("common");
  const platformDomain = process.env.PLATFORM_DOMAIN ?? "localtest.me";
  return (
    <div className="min-h-screen bg-muted/30 px-4 py-8">
      <div className="mx-auto grid max-w-2xl gap-6">
        <p className="text-lg font-semibold">{tc("appName")}</p>
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <main>
          <OnboardingWizard platformDomain={platformDomain} viaApi shop={shop} />
        </main>
      </div>
    </div>
  );
}
