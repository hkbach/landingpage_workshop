export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

export const RESERVED_SLUGS = [
  "app", "admin", "api", "www", "mail", "media", "static", "help", "support",
  "status", "blog", "docs", "cdn", "assets", "dashboard", "login", "signup",
] as const;

export type SlugCheck = "OK" | "INVALID_FORMAT" | "RESERVED";

export function checkSlugFormat(slug: string): SlugCheck {
  if (!SLUG_REGEX.test(slug)) return "INVALID_FORMAT";
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) return "RESERVED";
  return "OK";
}
