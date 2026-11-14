import { loadPublicSite, originOfSite } from "@/lib/public-site";

// Read from the API at each request (never at build time).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/sites/[slug]/robots.txt">) {
  const { slug } = await ctx.params;
  const site = await loadPublicSite(slug, { sessions: false }); // (no seats: one call instead of one per workshop)
  if (!site) return new Response("Not found", { status: 404 });
  const body = `User-agent: *
Allow: /
Disallow: /booking/
Disallow: /report

Sitemap: ${originOfSite(site)}/sitemap.xml
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
