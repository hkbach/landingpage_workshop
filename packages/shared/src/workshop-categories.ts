// The fields (ngành nghề) a workshop can belong to. The shop owner picks 1 to 3 for each workshop (required; for statistics and to show the workshop to the guests who like them);
// a guest picks three they like when they register an account (the Workshops page shows first the workshops that share the most of them). The text of each field is in the messages (`categories.<KEY>`), in every language.

export const WORKSHOP_CATEGORIES = [
  "COOKING", "BAKING", "COFFEE_TEA", "DRINKS", "POTTERY", "CANDLES", "FLORAL", "ART", "CRAFTS", "JEWELRY", "TEXTILE", "PHOTOGRAPHY", "MUSIC_DANCE", "WELLNESS", "OTHER",
] as const;
export type WorkshopCategory = (typeof WORKSHOP_CATEGORIES)[number];

/** How many fields a guest picks when they register (and keeps in their profile). */
export const FAVORITE_CATEGORY_COUNT = 3;

/** The fewest and the most categories a workshop has. */
export const WORKSHOP_CATEGORY_MIN = 1;
export const WORKSHOP_CATEGORY_MAX = 3;

export const isWorkshopCategory = (value: unknown): value is WorkshopCategory =>
  typeof value === "string" && (WORKSHOP_CATEGORIES as readonly string[]).includes(value);

/** Exactly three different fields, all of them valid. */
export function isFavoriteCategories(value: unknown): value is WorkshopCategory[] {
  return Array.isArray(value) && value.length === FAVORITE_CATEGORY_COUNT && value.every(isWorkshopCategory) && new Set(value).size === value.length;
}

/** The categories of a workshop: 1 to 3 different, valid ones. */
export function isWorkshopCategories(value: unknown): value is WorkshopCategory[] {
  return Array.isArray(value) && value.length >= WORKSHOP_CATEGORY_MIN && value.length <= WORKSHOP_CATEGORY_MAX && value.every(isWorkshopCategory) && new Set(value).size === value.length;
}

/**
 * The list with the field added, or taken out when it is there already; a field is not added once `max` are picked (a guest picks three, a workshop has up to three, so that is
 * the default).
 */
export function toggleCategory(picked: readonly WorkshopCategory[], category: WorkshopCategory, max: number = FAVORITE_CATEGORY_COUNT): WorkshopCategory[] {
  if (picked.includes(category)) return picked.filter((c) => c !== category);
  return picked.length >= max ? [...picked] : [...picked, category];
}
