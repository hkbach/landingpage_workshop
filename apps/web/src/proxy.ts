import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SHOP_SLUG, SHOP_SECTIONS } from "@/lib/shop-path";
import { slugForOwnDomain } from "@/lib/own-domain";
import { buildCsp, newNonce } from "@/lib/csp";

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "localtest.me";

// Host routing (REQUIREMENTS 3.3): {slug}.PLATFORM_DOMAIN -> /sites/{slug}/...
async function route(request: NextRequest, requestHeaders: Headers) {
  // The shop owner area has the slug of the shop in its address; an old address such as /shopowner/bookings is sent there.
  const legacy = request.nextUrl.pathname.match(/^\/shopowner\/([^/]+)(\/.*)?$/);
  if ((SHOP_SECTIONS as readonly string[]).includes(legacy?.[1] ?? "")) {
    const url = request.nextUrl.clone();
    url.pathname = `/shopowner/${DEMO_SHOP_SLUG}/${legacy![1]}${legacy![2] ?? ""}`; // TODO(api): the slug of the session's organization
    return NextResponse.redirect(url);
  }
  const host = (request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  // The own domain of a shop (shop.example.com): the whole host is the landing page of that shop, like {slug}.PLATFORM_DOMAIN (so never the admin or the owner area on that origin).
  // (a platform host is never an own domain: no need to ask)
  const isPlatformHost = host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`) || host === "localhost";
  const own = isPlatformHost ? undefined : await slugForOwnDomain(host);
  if (own) {
    const url = request.nextUrl.clone();
    url.pathname = `/sites/${own}${url.pathname === "/" ? "" : url.pathname}`;
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }
  const platformHost = host === PLATFORM_DOMAIN || host === `app.${PLATFORM_DOMAIN}` || !host.endsWith(`.${PLATFORM_DOMAIN}`);
  // The system admin area has its own set of languages: the i18n request config reads this header (see i18n/request.ts). It is only served on the
  // platform's own hosts: on a shop's host the path is a page of the shop site (so a 404), never the admin area on the shop's origin.
  if (platformHost && (request.nextUrl.pathname === "/systemadmin" || request.nextUrl.pathname.startsWith("/systemadmin/"))) {
    const headers = new Headers(requestHeaders);
    headers.set("x-ui-area", "systemadmin");
    return NextResponse.next({ request: { headers } });
  }
  if (platformHost) return NextResponse.next({ request: { headers: requestHeaders } });
  const slug = host.slice(0, -(PLATFORM_DOMAIN.length + 1));
  if (!slug || slug.includes(".")) return NextResponse.next({ request: { headers: requestHeaders } });

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
}

/**
 * Every page answer carries a Content-Security-Policy with the nonce of its own request (see lib/csp.ts). The nonce also goes to the page in the request headers, where Next reads it and
 * puts it on its own scripts.
 */
export async function proxy(request: NextRequest) {
  const nonce = newNonce();
  const csp = buildCsp({
    nonce, dev: process.env.NODE_ENV !== "production", upgradeInsecure: process.env.NODE_ENV === "production" && process.env.CSP_UPGRADE_INSECURE !== "false", // (off only to try the production image over plain http on this machine)
    ...(process.env.API_ORIGIN ? { apiOrigin: process.env.API_ORIGIN } : {}), ...(process.env.MEDIA_ORIGIN ? { mediaOrigin: process.env.MEDIA_ORIGIN } : {}),
  });
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);
  const response = await route(request, requestHeaders);
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Skip API, Next internals and static assets; sitemap.xml / robots.txt must still be rewritten per host.
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|woff2?)$).*)",
  ],
};
