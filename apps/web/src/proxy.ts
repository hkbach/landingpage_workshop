import { NextResponse, type NextRequest } from "next/server";
import { DEMO_SHOP_SLUG, SHOP_SECTIONS } from "@/lib/shop-path";

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "localtest.me";

// Host routing (REQUIREMENTS 3.3): {slug}.PLATFORM_DOMAIN -> /sites/{slug}/...
export function proxy(request: NextRequest) {
  // The shop owner area has the slug of the shop in its address; an old address such as /shopowner/bookings is sent there.
  const legacy = request.nextUrl.pathname.match(/^\/shopowner\/([^/]+)(\/.*)?$/);
  if ((SHOP_SECTIONS as readonly string[]).includes(legacy?.[1] ?? "")) {
    const url = request.nextUrl.clone();
    url.pathname = `/shopowner/${DEMO_SHOP_SLUG}/${legacy![1]}${legacy![2] ?? ""}`; // TODO(api): the slug of the session's organization
    return NextResponse.redirect(url);
  }
  // The system admin area has its own set of languages: the i18n request config reads this header (see i18n/request.ts).
  if (request.nextUrl.pathname === "/systemadmin" || request.nextUrl.pathname.startsWith("/systemadmin/")) {
    const headers = new Headers(request.headers);
    headers.set("x-ui-area", "systemadmin");
    return NextResponse.next({ request: { headers } });
  }
  const host = (request.headers.get("host") ?? "").split(":")[0]!.toLowerCase();
  if (host === PLATFORM_DOMAIN || host === `app.${PLATFORM_DOMAIN}` || !host.endsWith(`.${PLATFORM_DOMAIN}`)) {
    return NextResponse.next();
  }
  const slug = host.slice(0, -(PLATFORM_DOMAIN.length + 1));
  if (!slug || slug.includes(".")) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/sites/${slug}${url.pathname === "/" ? "" : url.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // Skip API, Next internals and static assets; sitemap.xml / robots.txt must still be rewritten per host.
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:ico|png|jpe?g|gif|svg|webp|avif|css|js|map|woff2?)$).*)",
  ],
};
