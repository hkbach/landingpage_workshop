import { describe, expect, it } from "vitest";
import { currentShop } from "@/lib/mock/data";
import { DEMO_SHOP_SLUG, withShopSlug } from "./shop-path";

describe("withShopSlug", () => {
  it("puts the slug after /shopowner and keeps the query and the hash", () => {
    expect(withShopSlug("whiskladle", "/shopowner")).toBe("/shopowner/whiskladle");
    expect(withShopSlug("whiskladle", "/shopowner/bookings")).toBe("/shopowner/whiskladle/bookings");
    expect(withShopSlug("whiskladle", "/shopowner/site/preview?page=a&template=b")).toBe("/shopowner/whiskladle/site/preview?page=a&template=b");
    expect(withShopSlug("whiskladle", "/shopowner/settings#languages")).toBe("/shopowner/whiskladle/settings#languages");
  });
  it("leaves onboarding, other areas and addresses that already have the slug alone", () => {
    expect(withShopSlug("whiskladle", "/shopowner/onboarding")).toBe("/shopowner/onboarding");
    expect(withShopSlug("whiskladle", "/systemadmin/reports")).toBe("/systemadmin/reports");
    expect(withShopSlug("whiskladle", "/shopowner/whiskladle/bookings")).toBe("/shopowner/whiskladle/bookings");
    expect(withShopSlug("whiskladle", "/shopowners")).toBe("/shopowners");
  });
  it("returns the path unchanged when there is no slug", () => expect(withShopSlug(null, "/shopowner/bookings")).toBe("/shopowner/bookings"));
  it("the demo slug is the slug of the demo shop", () => expect(DEMO_SHOP_SLUG).toBe(currentShop.slug));
});
