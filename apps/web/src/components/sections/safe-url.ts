import { isAllowedMapsUrl, isHttpsUrl, isImageUrl, type ImageUrlOptions } from "@workshop/shared";

// URL validators for shop-provided links (REQUIREMENTS FR-SITE-02). Used both in schemas and at render time.
// The validators live in @workshop/shared (the API checks a page with the same rules); re-exported here for the web app.
export { isAllowedMapsUrl, isDataImageUrl, isHttpsUrl, isImageUrl, MAX_DATA_IMAGE_LENGTH, type ImageUrlOptions } from "@workshop/shared";

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
