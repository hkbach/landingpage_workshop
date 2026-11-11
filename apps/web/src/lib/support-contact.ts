// Platform support contact shown to shop owners (for help with publishing, review or their account).
// The values are configured by a platform admin in the admin area (built later); until then they come from mock data.
// Because they will be admin-editable text, every value is validated and its link is built here, never taken as-is.

export interface SupportContact {
  whatsapp?: string;
  phone?: string;
  zalo?: string;
  email?: string;
}

export type SupportChannel = "whatsapp" | "phone" | "zalo" | "email";

export interface SupportLink {
  channel: SupportChannel;
  /** Text shown to the shop owner (trimmed as entered). */
  value: string;
  href: string;
  /** Opens in a new tab (chat apps); phone and email use the default handler. */
  external: boolean;
}

/** Display order: WhatsApp, Phone, Zalo, Email. */
export const SUPPORT_CHANNELS: readonly SupportChannel[] = ["whatsapp", "phone", "zalo", "email"];

const digitsOf = (v: string) => v.replace(/\D/g, "");
// International numbers have 7 to 15 digits (E.164); national numbers with a leading 0 fit the same range.
const validNumber = (v: string) => /^[+\d\s().-]+$/.test(v) && digitsOf(v).length >= 7 && digitsOf(v).length <= 15;
// Plain ASCII addresses only: letters, digits and . _ % + - in the local part, a dotted domain with a letters-only TLD.
const validEmail = (v: string) => v.length <= 254 && /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/.test(v);

/** Whether a value an administrator typed is acceptable for a channel (an empty value is: it clears the channel). The same rules decide which links are shown. */
export function isValidSupportValue(channel: SupportChannel, raw: string): boolean {
  const value = raw.trim();
  if (!value) return true;
  return channel === "email" ? validEmail(value) : validNumber(value);
}

/** The links to show, in order. Empty, invalid or unsafe values are left out instead of producing a broken or unsafe link. */
export function supportLinks(contact: SupportContact | null | undefined): SupportLink[] {
  const links: SupportLink[] = [];
  if (!contact) return links;
  for (const channel of SUPPORT_CHANNELS) {
    const raw = contact[channel];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    if (channel === "email") {
      if (validEmail(value)) links.push({ channel, value, href: `mailto:${value}`, external: false });
      continue;
    }
    if (!validNumber(value)) continue;
    const digits = digitsOf(value);
    if (channel === "phone") links.push({ channel, value, href: `tel:${value.startsWith("+") ? "+" : ""}${digits}`, external: false });
    else if (channel === "whatsapp") links.push({ channel, value, href: `https://wa.me/${digits}`, external: true });
    else links.push({ channel, value, href: `https://zalo.me/${digits}`, external: true });
  }
  return links;
}
