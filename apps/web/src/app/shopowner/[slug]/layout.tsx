import { notFound } from "next/navigation";
import { requireArea } from "@/lib/api-server";
import { loadOwnShop, loadSupport } from "@/lib/own-shop";
import { DashboardShell } from "@/components/dashboard/shell/dashboard-shell";
import { ShopStatusBanner } from "@/components/dashboard/shell/shop-status-banner";

// The slug in /shopowner/{slug}/... is the slug of the shop and never changes. The shop is the one of the session (its slug must be the one in the address), and every page below reads its
// own data from the API.
export default async function DashboardLayout({ children, params }: LayoutProps<"/shopowner/[slug]">) {
  const { slug } = await params;
  await requireArea("SHOP_OWNER", (me) => me.organization?.slug === slug);
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
