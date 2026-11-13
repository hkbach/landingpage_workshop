import type { Locale } from "@workshop/shared";
import { apiGet, getSession, realApi } from "@/lib/api-server";
import { getPlatformSupport } from "@/lib/mock/platform";
import type { SupportContact } from "@/lib/support-contact";
import type { Shop } from "@/lib/types";

// The shop of the person who is logged in, and what the owner area needs about the platform. Connected to the API: `GET /organization` (the shop of the SESSION: never one named in the address)
// and `GET /support-contact`. Not connected: the sample data.

type ApiOrganization = {
  id: string; name: string; slug: string; status: Shop["status"]; statusReason: string | null; country: string; timezone: string; currency: string;
  defaultLocale: Locale; enabledLocales: Locale[]; contactEmail: string; contactPhone: string; whatsapp: string | null; address: string; mapsUrl: string;
  showOnCustomerPage: boolean; customDomain: string | null; customDomainVerifiedAt: string | null; createdAt: string;
};

/** The shop of the session as the owner area shows it, plus its own domain and whether the domain was verified. `null`: nobody logged in or no shop. */
export type OwnShop = Shop & { customDomain: string; customDomainVerified: boolean };

export async function loadOwnShop(): Promise<OwnShop | null> {
  if (!realApi()) return null;
  const [me, o] = await Promise.all([getSession(), apiGet<ApiOrganization>("/organization")]);
  if (!me || !o) return null;
  return {
    id: o.id, name: o.name, slug: o.slug, status: o.status, ...(o.statusReason ? { statusReason: o.statusReason } : {}), country: o.country, timezone: o.timezone, currency: o.currency,
    defaultLocale: o.defaultLocale, enabledLocales: o.enabledLocales, contactEmail: o.contactEmail, contactPhone: o.contactPhone, ...(o.whatsapp ? { whatsapp: o.whatsapp } : {}),
    address: o.address, mapsUrl: o.mapsUrl, ownerName: me.fullName, ownerEmail: me.email, createdAt: o.createdAt, showOnCustomerPage: o.showOnCustomerPage,
    customDomain: o.customDomain ?? "", customDomainVerified: Boolean(o.customDomainVerifiedAt),
  };
}

/** How to reach the platform team (only for somebody logged in). */
export async function loadSupport(): Promise<SupportContact> {
  if (!realApi()) return getPlatformSupport();
  return (await apiGet<SupportContact>("/support-contact")) ?? {};
}
