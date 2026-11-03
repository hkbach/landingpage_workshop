// Favorite workshops of a guest on the landing page of a shop. Frontend-only simulation: the guest "logs in" with an email and a code (see
// components/booking/otp.ts) and the browser remembers who they are and what they saved. TODO(api): the guest session is a cookie and the
// favorites are rows of a table, keyed by the guest, the shop (organization_id) and the workshop.

const GUEST_KEY = (slug: string) => `wk:guest:${slug}`;
const FAVORITES_KEY = (slug: string, email: string) => `wk:fav:${slug}:${email}`;
const CHANGED = "wk:favorites-changed";

/** The ids of the saved workshops from what was stored; anything that is not a list of text (or is damaged) gives an empty list. */
export function parseFavorites(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0))] : [];
  } catch {
    return [];
  }
}

/** The list with the workshop added, or taken out when it is there already. */
export function toggleFavorite(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

/** The email as the guest is known by: trimmed and lower case (BR-16). */
export const normalizeGuestEmail = (email: string): string => email.trim().toLowerCase();

const read = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null; // private window or blocked storage: the guest simply is not logged in
  }
};
const write = (key: string, value: string | null) => {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* nothing to keep it in: the next visit starts logged out */
  }
  window.dispatchEvent(new Event(CHANGED));
};

/** The email of the logged-in guest of this shop, "" when nobody is logged in. */
export const readGuestEmail = (slug: string): string => normalizeGuestEmail(read(GUEST_KEY(slug)) ?? "");
export const writeGuestEmail = (slug: string, email: string | null) => write(GUEST_KEY(slug), email === null ? null : normalizeGuestEmail(email));
/** What is stored for the favorites of a guest (parse it with parseFavorites); a string, so it can be compared between renders. */
export const readFavoritesRaw = (slug: string, email: string): string => (email ? read(FAVORITES_KEY(slug, email)) ?? "" : "");
export const writeFavorites = (slug: string, email: string, ids: readonly string[]) => write(FAVORITES_KEY(slug, normalizeGuestEmail(email)), JSON.stringify(ids));

/** Calls back when the guest or the favorites change, in this tab or in another one. */
export function subscribeFavorites(callback: () => void): () => void {
  window.addEventListener(CHANGED, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGED, callback);
    window.removeEventListener("storage", callback);
  };
}
