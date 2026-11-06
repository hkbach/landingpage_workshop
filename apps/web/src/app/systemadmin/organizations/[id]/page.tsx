import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { OrganizationDetail } from "@/components/admin/organization-detail";
import { adminAuditLogs, orgStats } from "@/lib/mock/admin";
import { AdminSessions } from "@/components/admin/admin-sessions";
import { PlatformFeesForm } from "@/components/admin/platform-fees-form";
import { currentShop } from "@/lib/mock/data";
import { liveShop } from "@/lib/mock/shop-admin-store";
import { getFeeRates } from "@/lib/mock/fee-rates-store";

export const dynamic = "force-dynamic"; // the status of a shop is changed at run time

export default async function OrganizationDetailPage({ params }: PageProps<"/systemadmin/organizations/[id]">) {
  const { id } = await params;
  const shop = liveShop(id);
  if (!shop) notFound();

  const t = await getTranslations("admin.orgDetail");
  const audit = adminAuditLogs.filter((a) => a.organizationId === shop.id).slice(0, 8);

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <Link href="/systemadmin/organizations" className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t("backToList")}
        </Link>
        <h1 className="text-2xl font-semibold">{shop.name}</h1>
      </header>
      <OrganizationDetail shop={shop} stats={orgStats[shop.id] ?? { workshops: 0, bookings30d: 0 }} audit={audit} />
      {/* The fee rates of this shop (every shop has its own). */}
      <PlatformFeesForm organizationId={shop.id} initial={getFeeRates(shop.id)} />
      {/* Mock: only the demo shop has sessions. */}
      {shop.id === currentShop.id ? <AdminSessions /> : null}
    </div>
  );
}
