import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { registeredShops } from "@/lib/mock/registered-shops-store";
import { getSession, realApi } from "@/lib/api-server";
import { OnboardingWizard } from "./onboarding-wizard";

// Standalone page (no dashboard shell): FR-ORG-01. Reached after email verification.
// With ?shop={slug} it finishes the setup of a shop that just signed up (the popup Sign up sends its owner here); an unknown slug is a 404.
export const dynamic = "force-dynamic";
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ shop?: string | string[] }> }) {
  const { shop: slug } = await searchParams;
  // Connected to the API: the shop is the one of the session (never one named in the address). Sample data: the shops of the sample store.
  const me = await getSession();
  const fromSession = me?.organization ? { name: me.organization.name, slug: me.organization.slug, ownerEmail: me.email } : undefined;
  const shop = me ? fromSession : typeof slug === "string" ? registeredShops().find((s) => s.slug === slug) : undefined;
  if (me ? !fromSession : typeof slug === "string" && !shop) notFound();
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
          <OnboardingWizard platformDomain={platformDomain} viaApi={realApi()} {...(shop ? { shop: { name: shop.name, slug: shop.slug, ownerEmail: shop.ownerEmail } } : {})} />
        </main>
      </div>
    </div>
  );
}
