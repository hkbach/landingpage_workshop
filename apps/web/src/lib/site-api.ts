import { ADMIN_REASON_COOKIE } from "./admin-edit-reason";

// Where the editor of the landing pages talks to. The shop owner's editor calls `/api/v1/site/...` (the shop is the one of the session). An administrator editing a shop calls the same routes under
// `/api/v1/admin/shops/{shopId}/site/...`, and every change carries the REASON the administrator gave (the `X-Admin-Reason` header, taken from the cookie the banner keeps).

/** `/api/v1/site` for the shop owner; `/api/v1/admin/shops/{id}/site` for an administrator editing the shop `adminShopId`. */
export const siteApiBase = (adminShopId?: string): string => (adminShopId ? `/api/v1/admin/shops/${encodeURIComponent(adminShopId)}/site` : "/api/v1/site");

/** The reason the administrator gave, as the cookie keeps it (already URI-encoded, which is what the header takes), or "". */
export function adminReasonHeader(): string {
  if (typeof document === "undefined") return "";
  const found = document.cookie.split("; ").find((c) => c.startsWith(`${ADMIN_REASON_COOKIE}=`));
  return found ? found.slice(ADMIN_REASON_COOKIE.length + 1) : "";
}

/** A call of the editor of the landing pages to the API (`path` after `/site`, like `/pages/{id}/draft`); for an administrator it carries the reason. */
export function siteFetch(adminShopId: string | undefined, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (adminShopId) {
    const reason = adminReasonHeader();
    if (reason) headers.set("x-admin-reason", reason);
  }
  return fetch(`${siteApiBase(adminShopId)}${path}`, { ...init, headers });
}
