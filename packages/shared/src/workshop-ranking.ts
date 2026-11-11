import { type WorkshopCategory } from "./workshop-categories";

// The order of the workshops on the Workshops page of a guest. Two aims: show first what the guest likes (their favorite categories), and give every shop the same chance to be
// seen. So the order is NOT fixed by anything of the shop or the workshop (not by the date it was created, not by the name): the shop that leads, the shop that follows and the
// workshop each shop puts first all ROTATE from one `seed` to the next (the page uses the day, mixed with the guest, so it changes every day and differs from guest to guest).

export interface RankItem {
  id: string;
  shopId: string;
  /** The categories of the workshop (1 to 3). */
  categories: readonly WorkshopCategory[];
}

/** A number from a text, the same each time (to mix a guest or a shop into the seed). */
export function hashText(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) >>> 0;
  return h;
}

/** How many categories a workshop shares with what the guest likes (0 to 3). */
export const relevance = (categories: readonly WorkshopCategory[], favorites: readonly WorkshopCategory[]): number => categories.filter((c) => favorites.includes(c)).length;

/** `list` turned `by` places: the item at `by` comes first and the ones before it go to the end. */
function rotate<T>(list: readonly T[], by: number): T[] {
  if (list.length === 0) return [];
  const k = ((by % list.length) + list.length) % list.length;
  return [...list.slice(k), ...list.slice(0, k)];
}

/**
 * The workshops in the order a guest sees them:
 *  1. By relevance: the ones that share the most categories with `favorites` come first, then fewer, then the ones that share none.
 *  2. Inside each group the shops take turns: one workshop of the first shop, one of the second, and so on, round after round until every workshop of the group is placed. A shop
 *     with more workshops in the group does not get ahead of the others (it only fills the last places when the others have run out).
 *  3. Which shop is first, and which workshop each shop shows first, rotates with `seed` (a whole number: the day, mixed with the guest). Every shop leads in its turn.
 * The same input gives the same order; nothing here reads a date.
 */
export function rankWorkshops<T extends RankItem>(items: readonly T[], favorites: readonly WorkshopCategory[], seed: number): T[] {
  const tiers = new Map<number, T[]>();
  for (const item of items) {
    const r = relevance(item.categories, favorites);
    tiers.set(r, [...(tiers.get(r) ?? []), item]);
  }
  const out: T[] = [];
  for (const r of [...tiers.keys()].sort((a, b) => b - a)) {
    const group = tiers.get(r)!;
    const shopIds = [...new Set(group.map((i) => i.shopId))].sort(); // a fixed base order, which the seed then turns
    const queues = rotate(shopIds, seed + r).map((shopId) => rotate(group.filter((i) => i.shopId === shopId).sort((a, b) => a.id.localeCompare(b.id)), seed + hashText(shopId)));
    for (let round = 0; queues.some((q) => round < q.length); round++) for (const q of queues) if (round < q.length) out.push(q[round]!);
  }
  return out;
}
