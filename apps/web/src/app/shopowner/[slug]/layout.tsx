import { notFound } from "next/navigation";
import { currentShop } from "@/lib/mock/data";
import { realApi, requireArea } from "@/lib/api-server";
import { loadOwnShop, loadSupport } from "@/lib/own-shop";
import { NewShopWelcome } from "@/components/dashboard/new-shop-welcome";
import { liveShop, liveShops } from "@/lib/mock/shop-admin-store";
import { isOnboarded } from "@/lib/mock/registered-shops-store";
import { DashboardShell } from "@/components/dashboard/shell/dashboard-shell";
import { ShopStatusBanner } from "@/components/dashboard/shell/shop-status-banner";

// The slug in /shopowner/{slug}/... is the slug of the shop and never changes.
// Connected to the API: the shop is the one of the session (and its slug must be the one in the address), and every page below reads its own data from the API.
// Sample data: the demo shop has the tools of the owner area; a shop that signed up has its own address and the welcome page.
export default async function DashboardLayout({ children, params }: LayoutProps<"/shopowner/[slug]">) {
  const { slug } = await params;
  await requireArea("SHOP_OWNER", (me) => me.organization?.slug === slug);
  if (realApi()) {
    const shop = await loadOwnShop();
    if (!shop) notFound();
    return (
      <DashboardShell
        shop={{ name: shop.name, slug: shop.slug, status: shop.status, ownerName: shop.ownerName, ownerEmail: shop.ownerEmail }}
        banner={<ShopStatusBanner status={shop.status} reason={shop.statusReason} />}
        support={await loadSupport()}
      >
        {children}
      </DashboardShell>
    );
  }
  const isDemo = slug === currentShop.slug;
  const known = isDemo ? undefined : liveShops().find((s) => s.slug === slug);
  if (!isDemo && !known) notFound();
  const shop = known ?? liveShop(currentShop.id) ?? currentShop; // the live shop: publishing the landing page makes a DRAFT shop ACTIVE
  return (
    <DashboardShell
      shop={{ name: shop.name, slug: shop.slug, status: shop.status, ownerName: shop.ownerName, ownerEmail: shop.ownerEmail }}
      banner={<ShopStatusBanner status={shop.status} reason={shop.statusReason} />}
      support={await loadSupport()}
    >
      {isDemo ? children : <NewShopWelcome shop={shop} setupDone={isOnboarded(shop.id)} />}
    </DashboardShell>
  );
}
