import { headers } from "next/headers";
import { PLATFORM_DOMAIN } from "./site-url";

/**
 * Base path for links inside a shop site: "" when served on {slug}.PLATFORM_DOMAIN (proxy rewrite),
 * "/sites/{slug}" when reached directly (e.g. localhost). Reading headers makes the page dynamic.
 */
export async function getSiteBase(slug: string): Promise<string> {
  const host = ((await headers()).get("host") ?? "").split(":")[0]!.toLowerCase();
  return host.endsWith(`.${PLATFORM_DOMAIN}`) ? "" : `/sites/${slug}`;
}
