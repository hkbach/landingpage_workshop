"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { withShopSlug, type ShopArea } from "@/lib/shop-path";

/**
 * The slug of the shop in the address and the area it is in: /shopowner/{slug}/... (the shop owner) or /systemadmin/shops/{slug}/... (an administrator editing the shop, on the admin site);
 * null outside those pages. Read from the path, which is the same on the server and in the browser.
 */
function useShopSlug(): { slug: string; area: ShopArea } | null {
  const [area, second, third] = (usePathname() ?? "").split("/").filter(Boolean);
  if (area === "shopowner" && second && second !== "onboarding") return { slug: second, area: "shopowner" };
  if (area === "systemadmin" && second === "shops" && third) return { slug: third, area: "admin" };
  return null;
}

/** `(path) => path with the slug of the shop in it`, for router.push and the like: write the path as "/shopowner/bookings"; an administrator editing the shop stays in the admin area. */
export function useShopHref(): (path: string) => string {
  const at = useShopSlug();
  return (path) => withShopSlug(at?.slug, path, at?.area);
}

/** A link inside the shop owner area: `href="/shopowner/bookings"` becomes `/shopowner/{slug}/bookings`. */
export function ShopLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const toShop = useShopHref();
  return <Link href={toShop(href)} {...props} />;
}
