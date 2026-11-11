export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export const RESERVED_SLUGS = [
  "app", "admin", "api", "www", "mail", "media", "static", "help", "support",
  "status", "blog", "docs", "cdn", "assets", "dashboard", "login", "signup",
  // Parts of the app host paths (/shopowner/{slug}, /shopowner/onboarding, /systemadmin).
  "shopowner", "systemadmin", "onboarding",
  // The sections of the owner area: /shopowner/{section} is an old address without the slug, so a shop cannot be called that.
  "today", "bookings", "customers", "workshops", "sessions", "finance", "promotions", "ratings", "site", "settings",
] as const;

export type SlugCheck = "OK" | "INVALID_FORMAT" | "RESERVED";

export function checkSlugFormat(slug: string): SlugCheck {
  if (!SLUG_REGEX.test(slug)) return "INVALID_FORMAT";
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return "RESERVED";
  return "OK";
}

const SLUG_MAX = 32;
const SLUG_FALLBACK = "shop";

/** The shop name as a slug candidate: lower case, no accents (đ becomes d), every run of other characters becomes one hyphen. */
export function slugifyShopName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, "");
}

/**
 * The slug the system gives a new shop, from its name (FR-ORG-01). The owner cannot choose it and nobody can change it afterwards,
 * because it is part of the shop's addresses (`{slug}.domain` and `/shopowner/{slug}`). A name that gives nothing usable (for
 * example a name written only in Korean, Japanese or Chinese characters) becomes "shop". A slug that is reserved, not valid or
 * already used by another shop gets "-2", "-3", ... until it is free. `isTaken` is the uniqueness check of the whole system.
 */
export function generateShopSlug(name: string, isTaken: (slug: string) => boolean): string {
  const base = slugifyShopName(name);
  const start = base.length >= 3 ? base : base === "" ? SLUG_FALLBACK : `${base}-${SLUG_FALLBACK}`;
  const free = (s: string) => checkSlugFormat(s) === "OK" && !isTaken(s);
  if (free(start)) return start;
  for (let n = 2; n < 10_000; n++) {
    const suffix = `-${n}`;
    const candidate = `${start.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (free(candidate)) return candidate;
  }
  throw new Error("no free slug");
}
