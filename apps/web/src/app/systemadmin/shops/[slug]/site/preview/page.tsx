import { notFound } from "next/navigation";
import { isTemplateKey } from "@/components/sections/templates";
import { PreviewView } from "@/components/builder/site-views";
import { loadAdminShop } from "@/lib/admin-shop";

// The preview of the draft of a landing page of the shop, for an administrator.
export default async function AdminSitePreviewPage({ params, searchParams }: PageProps<"/systemadmin/shops/[slug]/site/preview">) {
  const { slug } = await params;
  const sp = await searchParams;
  const pageId = typeof sp.page === "string" && /^[a-z0-9-]{1,40}$/.test(sp.page) ? sp.page : undefined;
  const template = typeof sp.template === "string" && isTemplateKey(sp.template) ? sp.template : undefined;
  const shop = await loadAdminShop(slug);
  if (!shop) notFound();
  return <PreviewView shop={shop} pageId={pageId} template={template} adminShopId={shop.id} />;
}
