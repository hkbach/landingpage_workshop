import { describe, expect, it } from "vitest";
import { checkSlugFormat, generateShopSlug, slugifyShopName } from "./slug";

const none = () => false;

describe("slugifyShopName", () => {
  it("lower-cases, removes accents and turns other characters into single hyphens", () => {
    expect(slugifyShopName("Clay & Co Studio")).toBe("clay-co-studio");
    expect(slugifyShopName("Xưởng Gốm Đà Lạt")).toBe("xuong-gom-da-lat");
    expect(slugifyShopName("  --Hello,   World!!  ")).toBe("hello-world");
  });
  it("is at most 32 characters and never ends with a hyphen", () => {
    const s = slugifyShopName("a".repeat(31) + " b" + " c".repeat(10));
    expect(s.length).toBeLessThanOrEqual(32);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("generateShopSlug", () => {
  it("is the slug of the name when it is valid and free", () => expect(generateShopSlug("Clay & Co Studio", none)).toBe("clay-co-studio"));
  it("adds -2, -3 ... when the slug is taken", () => {
    const taken = new Set(["clay-studio", "clay-studio-2"]);
    expect(generateShopSlug("Clay Studio", (s) => taken.has(s))).toBe("clay-studio-3");
  });
  it("never returns a reserved slug", () => {
    expect(generateShopSlug("Admin", none)).toBe("admin-2");
    expect(generateShopSlug("Shopowner", none)).toBe("shopowner-2");
    expect(generateShopSlug("Onboarding", none)).toBe("onboarding-2");
  });
  it("gives \"shop\" to a name with nothing usable, and pads a name that is too short", () => {
    expect(generateShopSlug("工房", none)).toBe("shop");
    expect(generateShopSlug("한국 공방", none)).toBe("shop");
    expect(generateShopSlug("A", none)).toBe("a-shop");
    expect(generateShopSlug("工房", (s) => s === "shop")).toBe("shop-2");
  });
  it("keeps the suffix inside 32 characters", () => {
    const long = "x".repeat(40);
    const first = generateShopSlug(long, none);
    const second = generateShopSlug(long, (s) => s === first);
    expect(second.length).toBeLessThanOrEqual(32);
    expect(second.endsWith("-2")).toBe(true);
  });
  it("always passes the slug format check", () => {
    for (const n of ["Clay", "a", "工房", "My  Shop!!", "-- -- --", "9 Lives"]) expect(checkSlugFormat(generateShopSlug(n, none))).toBe("OK");
  });
});
