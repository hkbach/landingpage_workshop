import { loadPublicSite, originOfSite } from "@/lib/public-site";

export async function GET(_req: Request, ctx: RouteContext<"/sites/[slug]/robots.txt">) {
  const { slug } = await ctx.params;
  const site = await loadPublicSite(slug);
  if (!site) return new Response("Not found", { status: 404 });
  const body = `User-agent: *
Allow: /
Disallow: /booking/
Disallow: /report

Sitemap: ${originOfSite(site)}/sitemap.xml
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
