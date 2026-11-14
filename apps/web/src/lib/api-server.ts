import { headers } from "next/headers";
import { redirect } from "next/navigation";

// How the SERVER side of the web app talks to apps/api (the browser talks to it through the rewrite of /api/v1/* in next.config.ts, same origin).
// `API_URL` is the address of the API as the web server reaches it (http://127.0.0.1:4000 in development, http://api:4000 in the compose file). Empty: the web app runs on its
// built-in sample data (the mock), and none of the helpers below does anything.

const API_URL = (process.env.API_URL ?? "").replace(/\/+$/, "");

/** Whether the web app is connected to the real API. */
export function realApi(): boolean {
  return API_URL !== "";
}

/** The account of the session, as `GET /auth/me` returns it. */
export type Session = {
  type: "SHOP_OWNER" | "CUSTOMER" | "SUPER_ADMIN";
  id: string;
  email: string;
  fullName: string;
  uiLocale: string;
  organization?: { id: string; slug: string; name: string; status: "DRAFT" | "ACTIVE" | "SUSPENDED" };
};

/**
 * A request of the server to the API on behalf of the person: the cookie of the session goes along, so the API decides who the person is (nothing the browser sends as a header
 * or a body field is trusted for that). The cookie is never logged here. Returns the answer as it is; the caller looks at the status.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!API_URL) throw new Error("API_URL is not set: the web app is not connected to the API.");
  const incoming = await headers();
  const out = new Headers(init.headers);
  const cookie = incoming.get("cookie");
  if (cookie) out.set("cookie", cookie);
  const forwarded = incoming.get("x-forwarded-for");
  if (forwarded) out.set("x-forwarded-for", forwarded);
  if (init.body && !out.has("content-type")) out.set("content-type", "application/json");
  // A request that changes something must say where it comes from (the API refuses another site): the address the person used to reach this app.
  if (init.method && !["GET", "HEAD"].includes(init.method.toUpperCase()) && !out.has("origin")) {
    const host = incoming.get("x-forwarded-host") ?? incoming.get("host");
    if (host) out.set("origin", `${incoming.get("x-forwarded-proto") ?? "http"}://${host}`);
  }
  return fetch(`${API_URL}/api/v1${path}`, { ...init, headers: out, cache: "no-store" });
}

/** The JSON of a GET, or `null` when the API says the person is not logged in, may not see it, or it does not exist. A server error throws (the page shows its error page). */
export async function apiGet<T>(path: string): Promise<T | null> {
  const res = await apiFetch(path);
  if (res.status === 401 || res.status === 403 || res.status === 404) return null;
  if (!res.ok) throw new Error(`The API answered ${res.status} to GET ${path.split("?")[0]}`);
  return (await res.json()) as T;
}

/** Who is logged in: `null` for nobody (or when the web app is not connected to the API). */
export async function getSession(): Promise<Session | null> {
  return apiGet<Session>("/auth/me");
}

/** The first page of an area for somebody: the shop of a shop owner, the Today page of a customer, the system admin area. */
export function homeOf(me: Pick<Session, "type" | "id" | "organization">): string {
  if (me.type === "SUPER_ADMIN") return "/systemadmin";
  if (me.type === "SHOP_OWNER" && me.organization) return me.organization.status === "DRAFT" ? `/shopowner/onboarding?shop=${encodeURIComponent(me.organization.slug)}` : `/shopowner/${me.organization.slug}`;
  return `/customer/${me.id}/today`;
}

/**
 * The gate of a private area. Connected to the API: nobody logged in goes to /login, and somebody of another kind goes to their own area. Not connected (sample data): lets everybody in,
 * as before. Returns the session (or `null` when not connected).
 */
export async function requireArea(kind: Session["type"], also?: (me: Session) => boolean): Promise<Session> {
  const me = await getSession();
  if (!me) redirect("/login");
  if (me.type !== kind || (also && !also(me))) redirect(homeOf(me));
  return me;
}
