import { notFound } from "next/navigation";
import { loadMessages } from "@/i18n/messages";
import { SiteBuilder } from "@/components/builder/SiteBuilder";
import { LandingPageList } from "@/components/builder/LandingPageList";
import { SitePreview } from "@/components/builder/SitePreview";
import { countWorkshopsWithUpcomingSessions } from "@/components/builder/prereqs";
import { draftOf, pageMetaOf, starterDraft, type ServerPage } from "@/components/builder/server-pages";
import { PLATFORM_DOMAIN } from "@/components/site/site-url";
import { apiGet } from "@/lib/api-server";
import { shopPrefix } from "@/lib/admin-shop";
import { ownPromotions, ownWorkshops } from "@/lib/own-catalog";
import { toSession } from "@/lib/own-ops";
import { loadSupport, type OwnShop } from "@/lib/own-shop";
import { ownPageDetail, ownPageList } from "@/lib/own-site";
import { fetchAll } from "@/lib/shop-data";
import type { SupportContact } from "@/lib/support-contact";
import type { Locale } from "@workshop/shared";
import type { TemplateKey } from "@/components/sections/templates";

// The three screens of the landing pages, as the SHOP OWNER's pages and the pages of an ADMINISTRATOR editing a shop both show them. `adminShopId` is the shop an administrator edits: then every
// read goes to `/admin/shops/{id}/...` and the editor is told to send the reason with its changes; without it the shop is the one of the session. Server components: no state.

/** Only the sessions still to come count for the checklist (not every running session ever made). */
const upcoming = (prefix: string) => `${prefix}/sessions?status=RUNNING&from=${encodeURIComponent(new Date().toISOString())}`;

/** The list of the landing pages of the shop. */
export async function LandingPagesView({ shop, adminShopId }: { shop: OwnShop; adminShopId?: string }) {
  const prefix = shopPrefix(adminShopId);
  const [list, sessionList, server] = await Promise.all([ownWorkshops(adminShopId), fetchAll<Parameters<typeof toSession>[0]>(upcoming(prefix)), ownPageList(shop, adminShopId)]);
  const starter = starterDraft(shop, "classic");
  return (
    <LandingPageList
      server={server}
      {...(adminShopId ? { adminShopId } : {})}
      mainPage={{ name: shop.name, template: "classic" }}
      shopHost={shop.customDomain && shop.customDomainVerified ? shop.customDomain : `${shop.slug}.${PLATFORM_DOMAIN}`}
      shop={{ name: shop.name, defaultLocale: shop.defaultLocale, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone }}
      shopStatus={shop.status}
      upcomingWorkshopCount={countWorkshopsWithUpcomingSessions(list, sessionList.map(toSession))}
      sample={{ content: starter.content, theme: starter.theme }}
    />
  );
}

/** The builder of one landing page. */
export async function BuilderView({ shop, pageId, apply, adminShopId }: { shop: OwnShop; pageId: string; apply?: TemplateKey | undefined; adminShopId?: string }) {
  const prefix = shopPrefix(adminShopId);
  // everything at once (none of it needs the shop to be asked for again)
  const [detail, list, pages, sessionList, support] = await Promise.all([
    ownPageDetail(pageId, adminShopId), ownWorkshops(adminShopId), apiGet<{ items: ServerPage[] }>(`${prefix}/site/pages`), fetchAll<Parameters<typeof toSession>[0]>(upcoming(prefix)),
    loadSupport() as Promise<SupportContact>,
  ]);
  if (!detail) notFound();
  const draft = draftOf(detail, shop);
  return (
    <SiteBuilder
      pageId={pageId}
      server={{ page: pageMetaOf(detail), liveId: pages?.items.find((p) => p.isLive)?.id ?? null, source: detail.source === "DRAFT" ? "draft" : detail.source === "PUBLISHED" ? "published" : "starter" }}
      {...(adminShopId ? { adminShopId } : {})}
      mainPage={{ name: shop.name, template: draft.template }}
      shop={{ name: shop.name, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, contactEmail: shop.contactEmail, contactPhone: shop.contactPhone }}
      initial={draft}
      initialStatus={shop.status}
      {...(apply ? { applyTemplate: apply } : {})}
      upcomingWorkshopCount={countWorkshopsWithUpcomingSessions(list, sessionList.map(toSession))}
      support={support}
    />
  );
}

/** The preview of the draft with the renderer of the public site. */
export async function PreviewView({ shop, pageId, template, adminShopId }: { shop: OwnShop; pageId?: string | undefined; template?: TemplateKey | undefined; adminShopId?: string }) {
  const prefix = shopPrefix(adminShopId);
  const detail = pageId ? await ownPageDetail(pageId, adminShopId) : null;
  const draft = detail ? draftOf(detail, shop) : starterDraft(shop, "classic");
  const [list, sessionList, promo, messages] = await Promise.all([
    ownWorkshops(adminShopId), fetchAll<Parameters<typeof toSession>[0]>(`${prefix}/sessions`), ownPromotions(shop.timezone, adminShopId),
    Promise.all(shop.enabledLocales.map(async (l: Locale) => [l, (await loadMessages(l)).site as Record<string, unknown>] as const)),
  ]);
  const active = list.filter((w) => w.status === "ACTIVE");
  return (
    <SitePreview
      shop={{ name: shop.name, slug: shop.slug, defaultLocale: shop.defaultLocale, enabledLocales: shop.enabledLocales, timezone: shop.timezone, currency: shop.currency }}
      initial={draft} serverDraft={draft}
      workshops={active} sessions={sessionList.map(toSession).filter((s) => active.some((w) => w.id === s.workshopId))}
      promotions={promo.promotions} siteMessages={Object.fromEntries(messages)} previewTemplate={template} pageId={pageId}
    />
  );
}
