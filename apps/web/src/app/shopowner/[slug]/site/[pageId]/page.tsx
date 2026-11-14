import { notFound } from "next/navigation";
import { isTemplateKey } from "@/components/sections/templates";
import { BuilderView } from "@/components/builder/site-views";
import { loadOwnShop } from "@/lib/own-shop";

// The page, its draft and the live page are the server's. `?apply=KEY` (from the template preview banner) opens the "Switch template?" confirmation for that template.
export default async function SiteBuilderPage({ params, searchParams }: PageProps<"/shopowner/[slug]/site/[pageId]">) {
  const { pageId } = await params;
  const sp = await searchParams;
  const apply = typeof sp.apply === "string" && isTemplateKey(sp.apply) ? sp.apply : undefined;
  const shop = await loadOwnShop();
  if (!shop) notFound();
  return <BuilderView shop={shop} pageId={pageId} apply={apply} />;
}
