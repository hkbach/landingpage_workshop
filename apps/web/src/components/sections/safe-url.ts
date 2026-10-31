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

/** Returns the URL if it is a valid https image URL, otherwise undefined. */
export function safeImage(value: unknown): string | undefined {
  return typeof value === "string" && value && isHttpsUrl(value) ? value : undefined;
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
