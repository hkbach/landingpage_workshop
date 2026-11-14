import type { SupportContact } from "../support-contact";

// Platform-level settings (not per shop). How a shop owner and a customer reach the platform admin team for support.
// NOT the shop's own contact details and never shown on the shop's landing page or any public page.
// A platform admin edits these in the admin area (/systemadmin/support-contact); the shop owner and customer screens only read them.
// The values below are fake demo data, the starting values until an administrator saves new ones. Lives on globalThis like the other mock stores.
// TODO(api): `platform_settings`, SUPER_ADMIN only, audited.
export const platformSupport: SupportContact = {
  whatsapp: "+84 90 000 0001",
  phone: "+84 28 0000 0002",
  zalo: "0900000003",
  email: "support@workshopkit.example",
};

const g = globalThis as unknown as { __platformSupport?: SupportContact };

/** The support contact now: what the administrator saved, else the demo data. */
export const getPlatformSupport = (): SupportContact => ({ ...(g.__platformSupport ?? platformSupport) });

/** Saves the contact (every value already validated and trimmed; an empty one clears the channel). */
export function setPlatformSupport(contact: SupportContact): void {
  g.__platformSupport = Object.fromEntries(Object.entries(contact).filter(([, v]) => typeof v === "string" && v !== "")) as SupportContact;
}

/** Test helper: back to the demo data. */
export function resetPlatformSupport(): void {
  delete g.__platformSupport;
}
