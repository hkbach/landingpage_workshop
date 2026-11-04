// The fields (ngành nghề) a workshop can belong to. The shop owner picks one for each workshop (for statistics); a guest picks three they like when they register an
// account (later the workshops can be shown by the fields they chose). The text of each field is in the messages (`categories.<KEY>`), in every language.

export const WORKSHOP_CATEGORIES = [
  "COOKING", "BAKING", "COFFEE_TEA", "DRINKS", "POTTERY", "CANDLES", "FLORAL", "ART", "CRAFTS", "JEWELRY", "TEXTILE", "PHOTOGRAPHY", "MUSIC_DANCE", "WELLNESS", "OTHER",
] as const;
export type WorkshopCategory = (typeof WORKSHOP_CATEGORIES)[number];

/** How many fields a guest picks when they register (and keeps in their profile). */
export const FAVORITE_CATEGORY_COUNT = 3;

export const isWorkshopCategory = (value: unknown): value is WorkshopCategory =>
  typeof value === "string" && (WORKSHOP_CATEGORIES as readonly string[]).includes(value);

/** Exactly three different fields, all of them valid. */
export function isFavoriteCategories(value: unknown): value is WorkshopCategory[] {
  return Array.isArray(value) && value.length === FAVORITE_CATEGORY_COUNT && value.every(isWorkshopCategory) && new Set(value).size === value.length;
}

/** The list with the field added, or taken out when it is there already; a field is not added once the guest has picked all they can. */
export function toggleCategory(picked: readonly WorkshopCategory[], category: WorkshopCategory): WorkshopCategory[] {
  if (picked.includes(category)) return picked.filter((c) => c !== category);
  return picked.length >= FAVORITE_CATEGORY_COUNT ? [...picked] : [...picked, category];
}
