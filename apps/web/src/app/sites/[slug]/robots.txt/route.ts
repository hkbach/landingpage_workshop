import { getPublicSite } from "@/lib/mock/site";
import { siteOrigin } from "@/components/site/site-url";

export async function GET(_req: Request, ctx: RouteContext<"/sites/[slug]/robots.txt">) {
  const { slug } = await ctx.params;
  if (!getPublicSite(slug)) return new Response("Not found", { status: 404 });
  const body = `User-agent: *\nAllow: /\nDisallow: /booking/\nDisallow: /report\n\nSitemap: ${siteOrigin(slug)}/sitemap.xml\n`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
