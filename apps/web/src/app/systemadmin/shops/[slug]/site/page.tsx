import { notFound } from "next/navigation";
import { LandingPagesView } from "@/components/builder/site-views";
import { loadAdminShop } from "@/lib/admin-shop";

// The landing pages of the shop, with the editor of the shop owner, for an administrator (the changes carry the reason given in the banner).
export default async function AdminLandingPagesPage({ params }: PageProps<"/systemadmin/shops/[slug]/site">) {
  const { slug } = await params;
  const shop = await loadAdminShop(slug);
  if (!shop) notFound();
  return <LandingPagesView shop={shop} adminShopId={shop.id} />;
}
