
import { notFound } from "next/navigation";
import { currentShop } from "@/lib/mock/data";
import { DashboardShell } from "@/components/dashboard/shell/dashboard-shell";
import { ShopStatusBanner } from "@/components/dashboard/shell/shop-status-banner";

// The slug in /shopowner/{slug}/... is the slug of the shop and never changes. TODO(api): the shop of the session's organization.
export default async function DashboardLayout({ children, params }: LayoutProps<"/shopowner/[slug]">) {
  const { slug } = await params;
  if (slug !== currentShop.slug) notFound();
  const shop = currentShop;
  return (
    <DashboardShell
      shop={{ name: shop.name, slug: shop.slug, status: shop.status, ownerName: shop.ownerName, ownerEmail: shop.ownerEmail }}
      banner={<ShopStatusBanner status={shop.status} reason={shop.statusReason} />}
    >
      {children}
    </DashboardShell>
  );
}
