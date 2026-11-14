import { notFound } from "next/navigation";
import { isTemplateKey } from "@/components/sections/templates";
import { BuilderView } from "@/components/builder/site-views";
import { loadAdminShop } from "@/lib/admin-shop";

// The builder of a landing page of the shop, the same as the shop owner's, for an administrator.
export default async function AdminSiteBuilderPage({ params, searchParams }: PageProps<"/systemadmin/shops/[slug]/site/[pageId]">) {
  const { slug, pageId } = await params;
  const sp = await searchParams;
  const apply = typeof sp.apply === "string" && isTemplateKey(sp.apply) ? sp.apply : undefined;
  const shop = await loadAdminShop(slug);
  if (!shop) notFound();
  return <BuilderView shop={shop} pageId={pageId} apply={apply} adminShopId={shop.id} />;
}
