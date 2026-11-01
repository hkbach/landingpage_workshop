import { describe, expect, it } from "vitest";
import { checkNewPage, MAX_LANDING_PAGES_PER_SHOP, normalizeSlug } from "./landing-pages";

const ok = { name: "Summer promo", slug: "clayco-summer", pageCount: 1, takenSlugs: ["clayco", "waxwick"] };

describe("landing page limit", () => {
  it("is 2 per shop", () => expect(MAX_LANDING_PAGES_PER_SHOP).toBe(2));
  it("allows a page while below the limit", () => {
    expect(checkNewPage({ ...ok, pageCount: 0 })).toBe("OK");
    expect(checkNewPage(ok)).toBe("OK");
  });
  it("refuses the third page, whatever else is valid", () => {
    expect(checkNewPage({ ...ok, pageCount: 2 })).toBe("LIMIT");
    expect(checkNewPage({ ...ok, pageCount: 5 })).toBe("LIMIT");
  });
});

describe("new page fields", () => {
  it("needs a name of at most 60 characters", () => {
    expect(checkNewPage({ ...ok, name: "   " })).toBe("NAME_REQUIRED");
    expect(checkNewPage({ ...ok, name: "x".repeat(61) })).toBe("NAME_TOO_LONG");
    expect(checkNewPage({ ...ok, name: "x".repeat(60) })).toBe("OK");
  });
  it("checks the slug format and reserved words", () => {
    expect(checkNewPage({ ...ok, slug: "a" })).toBe("SLUG_INVALID");
    expect(checkNewPage({ ...ok, slug: "has space" })).toBe("SLUG_INVALID");
    expect(checkNewPage({ ...ok, slug: "admin" })).toBe("SLUG_RESERVED");
  });
  it("refuses an address that is already used, ignoring case and spaces", () => {
    expect(checkNewPage({ ...ok, slug: "waxwick" })).toBe("SLUG_TAKEN");
    expect(checkNewPage({ ...ok, slug: "  WaxWick " })).toBe("SLUG_TAKEN");
  });
  it("normalizes a slug to lower case", () => expect(normalizeSlug("  Clay-Summer ")).toBe("clay-summer"));
});
