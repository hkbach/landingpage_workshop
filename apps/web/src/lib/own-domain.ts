// Which shop an own domain (shop.example.com) belongs to, for the proxy. Connected to the API (API_URL): asked of `GET /public/domains/{host}` (a verified domain of an ACTIVE shop), and the
// answer is kept for a short time so a page does not cost a call to the API for each of its requests. Not connected: the sample data.

const API_URL = (process.env.API_URL ?? "").replace(/\/+$/, "");
const KEEP_MS = 60_000;
const MAX_ENTRIES = 500;
const cache = new Map<string, { slug: string | undefined; until: number }>();

/** The slug of the shop whose own domain is `host`, or `undefined`. A failure of the API counts as "no shop" for a moment only (the next request asks again). */
export async function slugForOwnDomain(host: string): Promise<string | undefined> {
  if (!API_URL) return undefined;
  const hit = cache.get(host);
  if (hit && hit.until > Date.now()) return hit.slug;
  let slug: string | undefined;
  let keep = KEEP_MS;
  try {
    const res = await fetch(`${API_URL}/api/v1/public/domains/${encodeURIComponent(host)}`, { cache: "no-store", signal: AbortSignal.timeout(2_000) });
    if (res.ok) slug = ((await res.json()) as { slug?: string }).slug;
    else if (res.status !== 404) keep = 3_000;
  } catch {
    keep = 3_000;
  }
  if (cache.size >= MAX_ENTRIES) cache.clear();
  cache.set(host, { slug, until: Date.now() + keep });
  return slug;
}
