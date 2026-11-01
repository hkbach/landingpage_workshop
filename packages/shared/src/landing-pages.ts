import { checkSlugFormat } from "./slug";

/** A shop owner can create at most this many landing pages (REQUIREMENTS FR-SITE-07). */
export const MAX_LANDING_PAGES_PER_SHOP = 2;
export const LANDING_PAGE_NAME_MAX = 60;

export type NewPageCheck = "OK" | "LIMIT" | "NAME_REQUIRED" | "NAME_TOO_LONG" | "SLUG_INVALID" | "SLUG_RESERVED" | "SLUG_TAKEN";

export const normalizeSlug = (slug: string) => slug.trim().toLowerCase();

/**
 * Whether a new landing page may be created. `takenSlugs` holds every address already in use (other shops' addresses and
 * this shop's own pages), because each page is public on its own {slug}.PLATFORM_DOMAIN. The server must run this too.
 */
export function checkNewPage(input: { name: string; slug: string; pageCount: number; takenSlugs: readonly string[] }): NewPageCheck {
  if (input.pageCount >= MAX_LANDING_PAGES_PER_SHOP) return "LIMIT";
  const name = input.name.trim();
  if (!name) return "NAME_REQUIRED";
  if (name.length > LANDING_PAGE_NAME_MAX) return "NAME_TOO_LONG";
  const slug = normalizeSlug(input.slug);
  const format = checkSlugFormat(slug);
  if (format === "INVALID_FORMAT") return "SLUG_INVALID";
  if (format === "RESERVED") return "SLUG_RESERVED";
  if (input.takenSlugs.some((s) => s.toLowerCase() === slug)) return "SLUG_TAKEN";
  return "OK";
}
