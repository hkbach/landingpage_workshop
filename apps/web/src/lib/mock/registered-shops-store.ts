// SERVER-ONLY: the shops that were created by a shop owner signing up (the popup Sign up of the public site), until apps/api exists. They are shops like the demo ones (the lists of the admin
// area show them, their owner can log in) but they start in DRAFT with no workshops and no landing page. Lives on globalThis like the other mock stores.
// TODO(api): `organizations` + `organization_members` created in one transaction with the user, the verification of the email, Turnstile.
import { generateShopSlug } from "@workshop/shared";
import type { Shop } from "../types";
import { shops } from "./data";

const g = globalThis as unknown as { __registeredShops?: Shop[] };
const list = () => (g.__registeredShops ??= []);

/** Test helper: no shop was registered. */
export function resetRegisteredShops(): void {
  g.__registeredShops = [];
}

/** The shops created by signing up, oldest first. */
export const registeredShops = (): Shop[] => [...list()];

/** Every shop of the platform: the demo shops and the ones that signed up. */
export const everyShop = (): Shop[] => [...shops, ...list()];

export const slugIsTaken = (slug: string): boolean => everyShop().some((s) => s.slug === slug);

/** Creates the shop of a new owner: DRAFT, the region of the demo (Vietnam), English; the owner completes the rest in Settings. The slug comes from the name (FR-ORG-01). */
export function registerShop(input: { name: string; ownerEmail: string; ownerName: string }, now = new Date()): Shop {
  const slug = generateShopSlug(input.name, slugIsTaken);
  const base = shops[0]!;
  const shop: Shop = {
    id: `org-${everyShop().length + 1}`, name: input.name.trim(), slug, status: "DRAFT", country: base.country, timezone: base.timezone, currency: base.currency,
    defaultLocale: "en", enabledLocales: ["en"], contactEmail: input.ownerEmail, contactPhone: "", address: "", mapsUrl: "",
    ownerName: input.ownerName, ownerEmail: input.ownerEmail, createdAt: now.toISOString(),
  };
  list().push(shop);
  return shop;
}
