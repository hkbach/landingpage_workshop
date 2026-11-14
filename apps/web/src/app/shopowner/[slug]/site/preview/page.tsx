import { notFound } from "next/navigation";
import { isTemplateKey } from "@/components/sections/templates";
import { PreviewView } from "@/components/builder/site-views";
import { loadOwnShop } from "@/lib/own-shop";

// Preview of the DRAFT with the same PageRenderer as the public site (FR-SITE-03). Dashboard-only route.
export default async function SitePreviewPage({ searchParams }: PageProps<"/shopowner/[slug]/site/preview">) {
  const sp = await searchParams;
  const pageId = typeof sp.page === "string" && /^[a-z0-9-]{1,40}$/.test(sp.page) ? sp.page : undefined;
  const template = typeof sp.template === "string" && isTemplateKey(sp.template) ? sp.template : undefined;
  const shop = await loadOwnShop();
  if (!shop) notFound();
  return <PreviewView shop={shop} pageId={pageId} template={template} />;
}
