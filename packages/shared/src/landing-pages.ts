/** A shop owner can create at most this many landing pages (REQUIREMENTS FR-SITE-07). */
export const MAX_LANDING_PAGES_PER_SHOP = 2;
/** ...and only this many of them can be public at the same time: the public one is shown at the shop's own address. */
export const MAX_LIVE_LANDING_PAGES = 1;
export const LANDING_PAGE_NAME_MAX = 60;

export type NewPageCheck = "OK" | "LIMIT" | "NAME_REQUIRED" | "NAME_TOO_LONG";

/** Whether a new landing page may be created. The server must run this too. */
export function checkNewPage(input: { name: string; pageCount: number }): NewPageCheck {
  if (input.pageCount >= MAX_LANDING_PAGES_PER_SHOP) return "LIMIT";
  const name = input.name.trim();
  if (!name) return "NAME_REQUIRED";
  if (name.length > LANDING_PAGE_NAME_MAX) return "NAME_TOO_LONG";
  return "OK";
}

/**
 * Pages that are public after `pageId` is published: only that one. Any other public page stops being public.
 * Returns the ids that are taken offline by the change.
 */
export function replacedByPublish(livePageIds: readonly string[], pageId: string): string[] {
  return livePageIds.filter((id) => id !== pageId);
}
