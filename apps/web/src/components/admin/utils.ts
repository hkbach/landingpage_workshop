import { formatDateTime } from "@/lib/format";

const DOMAIN = process.env.NEXT_PUBLIC_PLATFORM_DOMAIN || "localtest.me";

/** Public landing page URL of a shop: its own domain when it has one, else https://{slug}.{PLATFORM_DOMAIN} (http + dev port on localtest.me). */
export function landingUrl(slug: string, customDomain = ""): string {
  const host = customDomain || `${slug}.${DOMAIN}`;
  return DOMAIN === "localtest.me" ? `http://${host}:3000` : `https://${host}`;
}

export function landingHost(slug: string): string {
  return `${slug}.${DOMAIN}`;
}

/** Admin screens show instants in UTC so server and client renders match. */
export function fmt(iso: string, locale: string): string {
  return formatDateTime(iso, "UTC", locale);
}

/**
 * Draft preview of a shop. Mock only: points at the builder preview of the shop (own draft).
 * TODO(api): per-shop admin preview via GET /admin/organizations/{id}/preview (FR-ADM-02).
 */
export function previewHref(slug: string): string {
  return `/shopowner/${slug}/site/preview`;
}
