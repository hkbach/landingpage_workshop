import { describe, expect, it } from "vitest";
import { currentShop } from "@/lib/mock/data";
import { DEMO_SHOP_SLUG, withShopSlug } from "./shop-path";

describe("withShopSlug", () => {
  it("puts the slug after /shopowner and keeps the query and the hash", () => {
    expect(withShopSlug("clayco", "/shopowner")).toBe("/shopowner/clayco");
    expect(withShopSlug("clayco", "/shopowner/bookings")).toBe("/shopowner/clayco/bookings");
    expect(withShopSlug("clayco", "/shopowner/site/preview?page=a&template=b")).toBe("/shopowner/clayco/site/preview?page=a&template=b");
    expect(withShopSlug("clayco", "/shopowner/settings#languages")).toBe("/shopowner/clayco/settings#languages");
  });
  it("leaves onboarding, other areas and addresses that already have the slug alone", () => {
    expect(withShopSlug("clayco", "/shopowner/onboarding")).toBe("/shopowner/onboarding");
    expect(withShopSlug("clayco", "/systemadmin/reports")).toBe("/systemadmin/reports");
    expect(withShopSlug("clayco", "/shopowner/clayco/bookings")).toBe("/shopowner/clayco/bookings");
    expect(withShopSlug("clayco", "/shopowners")).toBe("/shopowners");
  });
  it("returns the path unchanged when there is no slug", () => expect(withShopSlug(null, "/shopowner/bookings")).toBe("/shopowner/bookings"));
  it("the demo slug is the slug of the demo shop", () => expect(DEMO_SHOP_SLUG).toBe(currentShop.slug));
});
