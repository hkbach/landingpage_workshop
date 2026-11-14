import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { OrganizationDetail } from "@/components/admin/organization-detail";
import { orgStats } from "@/lib/mock/admin";
import { liveAuditLogs } from "@/lib/mock/admin-audit-store";
import { AdminSessions } from "@/components/admin/admin-sessions";
import { PlatformFeesForm } from "@/components/admin/platform-fees-form";
import { currentShop } from "@/lib/mock/data";
import { liveShop } from "@/lib/mock/shop-admin-store";
import { getFeeRates } from "@/lib/mock/fee-rates-store";
import { apiGet, realApi } from "@/lib/api-server";
import type { AuditEntry, Shop } from "@/lib/types";
import type { FeeRates } from "@workshop/shared";

export const dynamic = "force-dynamic"; // the status of a shop is changed at run time

type ApiOrg = {
  id: string; name: string; slug: string; status: Shop["status"]; statusReason: string | null; country: string; timezone: string; currency: string; defaultLocale: Shop["defaultLocale"]; enabledLocales: Shop["enabledLocales"];
  contactEmail: string; contactPhone: string; whatsapp: string | null; address: string; mapsUrl: string; createdAt: string; counts: { workshops: number; bookings: number }; owners: { email: string; fullName: string }[];
};
type ApiAudit = { id: string; action: string; entityType: string; entityId: string; organizationId: string | null; actorEmail: string | null; actor: string; ip: string | null; createdAt: string };

/** The shop, its last audit lines, its fee rates and its counts from the API (the platform administrator reads any shop). */
async function loadFromApi(id: string) {
  const o = await apiGet<ApiOrg>(`/admin/organizations/${encodeURIComponent(id)}`);
  if (!o) return null;
  const [log, rates, listed] = await Promise.all([
    apiGet<{ items: ApiAudit[] }>(`/admin/audit-logs?org=${encodeURIComponent(o.id)}&limit=8`),
    apiGet<FeeRates>(`/admin/organizations/${encodeURIComponent(o.id)}/finance-settings`),
    apiGet<{ items: { id: string; bookings30d: number }[] }>(`/admin/organizations?q=${encodeURIComponent(o.slug)}&limit=5`),
  ]);
  const owner = o.owners[0];
  const shop: Shop = {
    id: o.id, name: o.name, slug: o.slug, status: o.status, ...(o.statusReason ? { statusReason: o.statusReason } : {}), country: o.country, timezone: o.timezone, currency: o.currency, defaultLocale: o.defaultLocale,
    enabledLocales: o.enabledLocales, contactEmail: o.contactEmail, contactPhone: o.contactPhone, ...(o.whatsapp ? { whatsapp: o.whatsapp } : {}), address: o.address, mapsUrl: o.mapsUrl, ownerName: owner?.fullName ?? "", ownerEmail: owner?.email ?? "", createdAt: o.createdAt,
  };
  const audit: AuditEntry[] = (log?.items ?? []).map((a) => ({
    id: a.id, ...(a.organizationId ? { organizationId: a.organizationId } : {}), actor: a.actorEmail ?? a.actor, action: a.action, entityType: a.entityType, entityId: a.entityId, createdAt: a.createdAt, ...(a.ip ? { ip: a.ip } : {}),
  }));
  return { shop, audit, rates: rates ?? { maintenanceBps: 0, serviceBps: 0 }, stats: { workshops: o.counts.workshops, bookings30d: listed?.items.find((x) => x.id === o.id)?.bookings30d ?? 0 } };
}

export default async function OrganizationDetailPage({ params }: PageProps<"/systemadmin/organizations/[id]">) {
  const { id } = await params;
  const t = await getTranslations("admin.orgDetail");
  let shop: Shop, audit: AuditEntry[], rates: FeeRates, stats: { workshops: number; bookings30d: number };
  let withSessions = false;
  if (realApi()) {
    const data = await loadFromApi(id);
    if (!data) notFound();
    ({ shop, audit, rates, stats } = data);
  } else {
    const found = liveShop(id);
    if (!found) notFound();
    shop = found;
    audit = liveAuditLogs().filter((a) => a.organizationId === shop.id).slice(0, 8);
    rates = getFeeRates(shop.id);
    stats = orgStats[shop.id] ?? { workshops: 0, bookings30d: 0 };
    withSessions = shop.id === currentShop.id;
  }

  return (
    <div className="grid gap-4">
      <header className="grid gap-2">
        <Link href="/systemadmin/organizations" className="inline-flex w-fit items-center gap-1 text-sm text-primary underline-offset-4 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> {t("backToList")}
        </Link>
        <h1 className="text-2xl font-semibold">{shop.name}</h1>
      </header>
      <OrganizationDetail shop={shop} stats={stats} audit={audit} />
      {/* The fee rates of this shop (every shop has its own). */}
      <PlatformFeesForm organizationId={shop.id} initial={rates} />
      {/* Sample data: only the demo shop has sessions. */}
      {withSessions ? <AdminSessions /> : null}
    </div>
  );
}
