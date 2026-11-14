import type { Metadata } from "next";
import { ReportForm } from "@/components/site/ReportForm";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSiteShell } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ReportPage({ params }: PageProps<"/sites/[slug]/report">) {
  const { slug } = await params;
  const site = await requireSiteShell(slug);
  const { shop, theme } = site;
  const base = await getSiteBase(slug, site.customDomain);
  return (
    <SiteIntlProvider locale={shop.defaultLocale}>
      <SiteFrame theme={theme} locale={shop.defaultLocale}>
        <main className="mx-auto w-full max-w-xl px-4 py-10">
          <ReportForm slug={shop.slug} homeHref={base || "/"} />
        </main>
      </SiteFrame>
    </SiteIntlProvider>
  );
}
