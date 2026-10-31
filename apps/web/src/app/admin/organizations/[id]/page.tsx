import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { OrganizationDetail } from "@/components/admin/organization-detail";
import { adminAuditLogs, orgStats } from "@/lib/mock/admin";
import { shops } from "@/lib/mock/data";

export default async function OrganizationDetailPage({ params }: PageProps<"/admin/organizations/[id]">) {
  const { id } = await params;
  const shop = shops.find((s) => s.id === id);
  if (!shop) notFound();

  const t = await getTranslations("admin.orgDetail");
  const audit = adminAuditLogs.filter((a) => a.organizationId === shop.id).slice(0, 8);

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <Link href="/admin/organizations" className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t("backToList")}
        </Link>
        <h1 className="text-2xl font-semibold">{shop.name}</h1>
      </header>
      <OrganizationDetail shop={shop} stats={orgStats[shop.id] ?? { workshops: 0, bookings30d: 0 }} audit={audit} />
    </div>
  );
}
