
import { notFound } from "next/navigation";
import { currentShop } from "@/lib/mock/data";
import { requireArea } from "@/lib/api-server";
import { NewShopWelcome } from "@/components/dashboard/new-shop-welcome";
import { liveShop, liveShops } from "@/lib/mock/shop-admin-store";
import { isOnboarded } from "@/lib/mock/registered-shops-store";
import { getPlatformSupport } from "@/lib/mock/platform";
import { DashboardShell } from "@/components/dashboard/shell/dashboard-shell";
import { ShopStatusBanner } from "@/components/dashboard/shell/shop-status-banner";

// The slug in /shopowner/{slug}/... is the slug of the shop and never changes. TODO(api): the shop of the session's organization.
export default async function DashboardLayout({ children, params }: LayoutProps<"/shopowner/[slug]">) {
  const { slug } = await params;
  await requireArea("SHOP_OWNER", (me) => me.organization?.slug === slug); // connected to the API: the owner of THIS shop, with a session
  const isDemo = slug === currentShop.slug;
  // The demo shop has the tools of the owner area; a shop that signed up (or another demo shop) has its own address and the welcome page for now.
  const known = isDemo ? undefined : liveShops().find((s) => s.slug === slug);
  if (!isDemo && !known) notFound();
  const shop = known ?? liveShop(currentShop.id) ?? currentShop; // the live shop: publishing the landing page makes a DRAFT shop ACTIVE
  return (
    <DashboardShell
      shop={{ name: shop.name, slug: shop.slug, status: shop.status, ownerName: shop.ownerName, ownerEmail: shop.ownerEmail }}
      banner={<ShopStatusBanner status={shop.status} reason={shop.statusReason} />}
      support={getPlatformSupport()}
    >
      {isDemo ? children : <NewShopWelcome shop={shop} setupDone={isOnboarded(shop.id)} />}
    </DashboardShell>
  );
}
