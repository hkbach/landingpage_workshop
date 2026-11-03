import { headers } from "next/headers";
import { PLATFORM_DOMAIN } from "./site-url";

/**
 * Base path for links inside a shop site: "" when served on {slug}.PLATFORM_DOMAIN (proxy rewrite),
 * "/sites/{slug}" when reached directly (e.g. localhost, or app.PLATFORM_DOMAIN, which the proxy does not rewrite). Reading headers makes the page dynamic.
 */
export async function getSiteBase(slug: string): Promise<string> {
  const host = ((await headers()).get("host") ?? "").split(":")[0]!.toLowerCase();
  return host === `${slug.toLowerCase()}.${PLATFORM_DOMAIN}` ? "" : `/sites/${slug}`;
}
