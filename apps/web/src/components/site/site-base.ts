import { headers } from "next/headers";
import { getCustomDomain } from "@/lib/mock/shop-domain-store";
import { PLATFORM_DOMAIN } from "./site-url";

/**
 * Base path for links inside a shop site: "" when served on {slug}.PLATFORM_DOMAIN or on the own domain of the shop (proxy rewrite),
 * "/sites/{slug}" when reached directly (e.g. localhost, or app.PLATFORM_DOMAIN, which the proxy does not rewrite). Reading headers makes the page dynamic.
 */
export async function getSiteBase(slug: string): Promise<string> {
  const host = ((await headers()).get("host") ?? "").split(":")[0]!.toLowerCase();
  const own = getCustomDomain(slug);
  return host === `${slug.toLowerCase()}.${PLATFORM_DOMAIN}` || (own !== "" && host === own) ? "" : `/sites/${slug}`;
}
