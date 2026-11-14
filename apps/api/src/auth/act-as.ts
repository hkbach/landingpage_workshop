// The platform administrator acting FOR a shop on the pages of the shop owner (workshops and sessions). The page of the owner calls the same routes as always; the browser of the administrator adds
// `X-Act-As-Shop` (the slug or the id of the shop) and `X-Admin-Reason`. TenantGuard honours the header ONLY for a SUPER_ADMIN, ONLY for the routes below, and needs the reason for every change.
// Everything else about the request is the owner's: the same services, the same rules, the same audit lines; the actor is the administrator.

export const ACT_AS_HEADER = "x-act-as-shop";
export const ADMIN_REASON_HEADER = "x-admin-reason";
export const ADMIN_REASON_MAX = 300;

/** What an administrator may READ of a shop through the owner's routes: what the owner pages of workshops, sessions and the landing page editor load. */
const READ_PREFIXES = ["workshops", "sessions", "bookings", "customers", "promotions", "organization", "site/pages"] as const;
/** What an administrator may CHANGE: the workshops (with their schedule rules and status) and the sessions (with their actions). Never bookings, money, settings, domains or accounts. */
const WRITE_PREFIXES = ["workshops", "sessions"] as const;

/** The path of a request without the API prefix and the query: `/api/v1/workshops/ab/status?x=1` is `workshops/ab/status`. */
export function routePath(url: string): string {
  const path = (url.split("?")[0] ?? "").replace(/^\/api\/v1\/?/, "").replace(/^\/+|\/+$/g, "");
  return path;
}

const under = (path: string, prefix: string): boolean => path === prefix || path.startsWith(`${prefix}/`);

/** Whether an administrator acting for a shop may make this request. */
export function actingAllowed(method: string, url: string): boolean {
  const path = routePath(url);
  const prefixes = method === "GET" || method === "HEAD" ? READ_PREFIXES : WRITE_PREFIXES;
  return prefixes.some((p) => under(path, p));
}

/** The reason an administrator gave (URI-encoded in the header, as the browser sends it), trimmed; "" when there is none. */
export function reasonFromHeader(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "";
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/** The kind of change told to the owners, from the first segment of the route. */
export function actingKind(url: string): "WORKSHOP_CHANGED" | "SESSION_CHANGED" {
  return routePath(url).startsWith("sessions") ? "SESSION_CHANGED" : "WORKSHOP_CHANGED";
}
