import { apiGet } from "@/lib/api-server";
import { draftOf, pageMetaOf, type ServerPage, type ServerPageDetail, type ServerPageList } from "@/components/builder/server-pages";
import type { Locale } from "@workshop/shared";

// The landing pages of the shop of the session, from the API. (Only called when connected to the API.)

export async function ownPageDetail(id: string): Promise<ServerPageDetail | null> {
  return apiGet<ServerPageDetail>(`/site/pages/${encodeURIComponent(id)}`);
}

/** The pages of the shop, with what each of them shows now (for the list). */
export async function ownPageList(shop: { name: string; defaultLocale: Locale }): Promise<ServerPageList> {
  const list = (await apiGet<{ items: ServerPage[] }>("/site/pages"))?.items ?? [];
  const details = await Promise.all(list.map((p) => ownPageDetail(p.id)));
  const drafts: ServerPageList["drafts"] = {};
  list.forEach((p, i) => {
    const d = details[i];
    if (d) drafts[p.id] = draftOf(d, shop);
  });
  return { pages: list.map(pageMetaOf), liveId: list.find((p) => p.isLive)?.id ?? null, drafts, saved: list.filter((p) => p.hasDraft).map((p) => p.id) };
}
