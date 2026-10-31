import type { Metadata } from "next";
import { ReportForm } from "@/components/site/ReportForm";
import { SiteFrame } from "@/components/site/SiteFrame";
import { SiteIntlProvider } from "@/components/site/SiteIntlProvider";
import { requireSite } from "@/components/site/resolve";
import { getSiteBase } from "@/components/site/site-base";

export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function ReportPage({ params }: PageProps<"/sites/[slug]/report">) {
  const { slug } = await params;
  const { shop, theme } = requireSite(slug);
  const base = await getSiteBase(slug);
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
