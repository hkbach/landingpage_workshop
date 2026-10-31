import { NextResponse, type NextRequest } from "next/server";

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? "localtest.me";

// Host routing (REQUIREMENTS 3.3): {slug}.PLATFORM_DOMAIN -> /sites/{slug}/...
export function proxy(request: NextRequest) {
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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\..*).*)"],
};
