import type { Localized } from "@workshop/shared";
import { matchesSearch } from "./text-search";

/**
 * Whether a workshop is found by what the guest typed in the search box of the Workshops page: the text is looked for in the name of the workshop (in every
 * language the shop wrote it in, so a guest finds it whatever language they read) and in the name of the shop. Case and accents do not matter; an empty search
 * finds everything.
 */
export function workshopMatches(workshop: { title: Localized }, shopName: string, typed: string): boolean {
  return [...Object.values(workshop.title), shopName].some((text) => typeof text === "string" && matchesSearch(text, typed));
}
