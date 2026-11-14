import { apiFetch } from "@/lib/api-server";

// Reads of the owner area from the API, server side. The API answers lists a page at a time (`{ items, nextCursor }`, at most 100 items). The owner pages were written to take a whole list and
// filter, sort and search it in the browser, so for now `fetchAll` follows the cursors and gives the whole list, up to `max` items.
// KNOWN LIMIT: a shop with more than `max` rows of one kind sees the newest `max` only. Moving the filters and the paging of the busiest lists (bookings, customers) to the server is the next
// improvement (docs/WEB_API_INTEGRATION.md).

export const FETCH_ALL_MAX = 2000;

type Page<T> = { items: T[]; nextCursor?: string | null };

/** The whole list at `path` (a path with or without a query string), page after page. A 401/403/404 gives an empty list; a server error throws (the page shows its error page). */
export async function fetchAll<T>(path: string, max = FETCH_ALL_MAX): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null | undefined;
  do {
    const sep = path.includes("?") ? "&" : "?";
    const res = await apiFetch(`${path}${sep}limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (res.status === 401 || res.status === 403 || res.status === 404) return out;
    if (!res.ok) throw new Error(`The API answered ${res.status} to GET ${path.split("?")[0]}`);
    const page = (await res.json()) as Page<T>;
    out.push(...page.items);
    // (an empty page or the same cursor again would loop for ever: the list ends there)
    const next = page.items.length > 0 && page.nextCursor !== cursor ? page.nextCursor : null;
    cursor = next;
  } while (cursor && out.length < max);
  return out.slice(0, max);
}
