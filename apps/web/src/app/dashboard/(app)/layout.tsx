import type { ReactNode } from "react";
import { currentShop } from "@/lib/mock/data";
import { DashboardShell } from "@/components/dashboard/shell/dashboard-shell";
import { ShopStatusBanner } from "@/components/dashboard/shell/shop-status-banner";

export default function DashboardLayout({ children }: { children: ReactNode }) {
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
