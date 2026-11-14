"use client";

import { useEffect } from "react";
import { adminReasonHeader } from "@/lib/site-api";

/**
 * While an administrator edits a shop (`/systemadmin/shops/{slug}/...`) the pages are the shop owner's, and they call the API as they always do. This makes every call of THIS tab to `/api/v1/...`
 * carry the shop it is for (`X-Act-As-Shop`) and the reason the administrator gave in the banner (`X-Admin-Reason`): the API honours them only for a platform administrator, only for the workshops
 * and the sessions, and refuses a change without a reason. Per tab: another tab with another shop sends its own shop. The original `fetch` comes back when the page is left.
 *
 * It renders nothing; it sits BEFORE the pages in the layout so that its effect runs before theirs.
 */
export function ActingFetch({ slug }: { slug: string }) {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = new URL(url, window.location.href);
      // (the routes of the administrator, `/api/v1/admin/...`, name their shop in the path and send their own reason)
      if (path.origin !== window.location.origin || !path.pathname.startsWith("/api/v1/") || path.pathname.startsWith("/api/v1/admin/")) return original(input, init);
      const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
      headers.set("x-act-as-shop", slug);
      const reason = adminReasonHeader();
      if (reason) headers.set("x-admin-reason", reason);
      return original(input, { ...init, headers });
    };
    return () => { window.fetch = original; };
  }, [slug]);
  return null;
}
