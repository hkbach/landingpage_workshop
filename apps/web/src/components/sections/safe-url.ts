import { isPlatformMediaPath } from "@workshop/shared";

// URL validators for shop-provided links (REQUIREMENTS FR-SITE-02). Used both in schemas and at render time.
function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isHttpsUrl(value: string): boolean {
  return parse(value)?.protocol === "https:";
}

/** Only google.com/maps or maps.app.goo.gl over https. */
export function isAllowedMapsUrl(value: string): boolean {
  const u = parse(value);
  if (!u || u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  return (host === "google.com" || host === "www.google.com") && (u.pathname === "/maps" || u.pathname.startsWith("/maps/"));
}

/** data:image/(jpeg|png|webp);base64 - produced by the mock uploader; valid ONLY in the builder/preview context. */
const DATA_IMAGE_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_DATA_IMAGE_LENGTH = 2_500_000;

export function isDataImageUrl(value: string): boolean {
  return value.length <= MAX_DATA_IMAGE_LENGTH && DATA_IMAGE_RE.test(value);
}

export interface ImageUrlOptions {
  /** Accept uploaded data: URLs. Only the builder and its preview may set this; never the public site. */
  allowDataImages?: boolean;
}

/** https image URL, an image the platform serves itself (/api/v1/media/...), or (builder/preview only) a data:image URL. */
export function isImageUrl(value: string, opts?: ImageUrlOptions): boolean {
  return isHttpsUrl(value) || isPlatformMediaPath(value) || (opts?.allowDataImages === true && isDataImageUrl(value));
}

/** Returns the URL if it is a valid image URL for this context, otherwise undefined. */
export function safeImage(value: unknown, opts?: ImageUrlOptions): string | undefined {
  return typeof value === "string" && value && isImageUrl(value, opts) ? value : undefined;
}
export function safeLink(value: unknown): string | undefined {
  return typeof value === "string" && value && isHttpsUrl(value) ? value : undefined;
}
export function safeMaps(value: unknown): string | undefined {
  return typeof value === "string" && value && isAllowedMapsUrl(value) ? value : undefined;
}
/** tel: href from a phone string (digits, +, spaces only). */
export function telHref(phone: string): string | undefined {
  const cleaned = phone.replace(/[^\d+]/g, "");
  return cleaned.length >= 5 ? `tel:${cleaned}` : undefined;
}
export function whatsappHref(phone: string): string | undefined {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 5 ? `https://wa.me/${digits}` : undefined;
}
