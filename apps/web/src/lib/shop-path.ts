// The shop owner area lives at /shopowner/{slug}/...: the slug of the shop is part of every address. The code writes the paths
// without it ("/shopowner/bookings"); these helpers put the slug in. /shopowner/onboarding has no shop yet, so it stays as it is.

/** The slug of the demo shop (the mock session). TODO(api): the slug comes from the session's organization. */
export const DEMO_SHOP_SLUG = "whiskladle";

const ROOT = "/shopowner";
/** The pages of a shop an administrator edits live in the admin area, at /systemadmin/shops/{slug}/...: the same pages as the shop owner's, on the admin site. */
export const ADMIN_SHOP_ROOT = "/systemadmin/shops";
/** Where the paths written as "/shopowner/..." lead: the shop owner area, or the admin area while an administrator edits the shop. */
export type ShopArea = "shopowner" | "admin";
/** The sections of the shop owner area: an old address such as /shopowner/bookings is sent to /shopowner/{slug}/bookings. */
export const SHOP_SECTIONS = ["today", "bookings", "customers", "workshops", "sessions", "finance", "promotions", "site", "settings"] as const;

/** `/shopowner/bookings?x=1#y` -> `/shopowner/whiskladle/bookings?x=1#y`. Other paths, and paths that already have the slug, are returned as they are. */
export function withShopSlug(slug: string | null | undefined, path: string, area: ShopArea = "shopowner"): string {
  if (!slug || !path.startsWith(ROOT)) return path;
  const rest = path.slice(ROOT.length);
  if (rest !== "" && !/^[/?#]/.test(rest)) return path;
  if (rest === "/onboarding" || rest.startsWith("/onboarding/") || rest.startsWith("/onboarding?") || rest.startsWith("/onboarding#")) return path;
  const root = area === "admin" ? ADMIN_SHOP_ROOT : ROOT;
  if (rest === `/${slug}` || rest.startsWith(`/${slug}/`) || rest.startsWith(`/${slug}?`) || rest.startsWith(`/${slug}#`)) return area === "admin" ? `${root}${rest}` : path;
  return `${root}/${slug}${rest}`;
}
