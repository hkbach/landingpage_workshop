"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { withShopSlug } from "@/lib/shop-path";

/** The slug of the shop in the address (/shopowner/{slug}/...); null outside the shop owner pages. Read from the path, which is the same on the server and in the browser. */
function useShopSlug(): string | null {
  const [area, slug] = (usePathname() ?? "").split("/").filter(Boolean);
  return area === "shopowner" && slug && slug !== "onboarding" ? slug : null;
}

/** `(path) => path with the slug of the shop in it`, for router.push and the like: write the path as "/shopowner/bookings". */
export function useShopHref(): (path: string) => string {
  const slug = useShopSlug();
  return (path) => withShopSlug(slug, path);
}

/** A link inside the shop owner area: `href="/shopowner/bookings"` becomes `/shopowner/{slug}/bookings`. */
export function ShopLink({ href, ...props }: ComponentProps<typeof Link> & { href: string }) {
  const toShop = useShopHref();
  return <Link href={toShop(href)} {...props} />;
}
