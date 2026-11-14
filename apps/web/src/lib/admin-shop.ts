import type { Locale } from "@workshop/shared";
import { apiGet } from "@/lib/api-server";
import type { OwnShop } from "@/lib/own-shop";

// The shop an administrator edits, from the API (`GET /admin/organizations`), in the shape the editor of the shop owner takes. The administrator has no shop of their own session, so the shop is
// found by the slug in the address.

type ApiOrg = {
  id: string; name: string; slug: string; status: OwnShop["status"]; statusReason: string | null; country: string; timezone: string; currency: string; defaultLocale: Locale; enabledLocales: Locale[];
  contactEmail: string; contactPhone: string; whatsapp: string | null; address: string; mapsUrl: string; ownerName?: string; ownerEmail?: string; customDomain?: string | null; customDomainVerified?: boolean;
  showOnCustomerPage?: boolean; createdAt?: string;
};

/** The shop `slug` as the editor takes it, or `null` when there is none. */
export async function loadAdminShop(slug: string): Promise<OwnShop | null> {
  const list = await apiGet<{ items: ApiOrg[] }>(`/admin/organizations?q=${encodeURIComponent(slug)}&limit=100`);
  const o = list?.items.find((x) => x.slug === slug);
  if (!o) return null;
  return {
    id: o.id, name: o.name, slug: o.slug, status: o.status, ...(o.statusReason ? { statusReason: o.statusReason } : {}), country: o.country, timezone: o.timezone, currency: o.currency,
    defaultLocale: o.defaultLocale, enabledLocales: o.enabledLocales, contactEmail: o.contactEmail, contactPhone: o.contactPhone, ...(o.whatsapp ? { whatsapp: o.whatsapp } : {}),
    address: o.address, mapsUrl: o.mapsUrl, ownerName: o.ownerName ?? "", ownerEmail: o.ownerEmail ?? "", createdAt: o.createdAt ?? new Date().toISOString(), showOnCustomerPage: Boolean(o.showOnCustomerPage),
    customDomain: o.customDomain ?? "", customDomainVerified: Boolean(o.customDomainVerified),
  };
}

/** The start of the paths of the API for the shop an administrator edits (`/admin/shops/{id}`), or "" for the shop of the session. */
export const shopPrefix = (adminShopId?: string): string => (adminShopId ? `/admin/shops/${adminShopId}` : "");
