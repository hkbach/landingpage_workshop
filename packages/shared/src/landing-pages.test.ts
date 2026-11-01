import { describe, expect, it } from "vitest";
import { checkNewPage, MAX_LANDING_PAGES_PER_SHOP, MAX_LIVE_LANDING_PAGES, replacedByPublish } from "./landing-pages";

describe("landing page limits", () => {
  it("is 2 pages per shop and 1 public page at a time", () => {
    expect(MAX_LANDING_PAGES_PER_SHOP).toBe(2);
    expect(MAX_LIVE_LANDING_PAGES).toBe(1);
  });
  it("allows a page while below the limit and refuses the third", () => {
    expect(checkNewPage({ name: "Summer promo", pageCount: 0 })).toBe("OK");
    expect(checkNewPage({ name: "Summer promo", pageCount: 1 })).toBe("OK");
    expect(checkNewPage({ name: "Summer promo", pageCount: 2 })).toBe("LIMIT");
    expect(checkNewPage({ name: "", pageCount: 5 })).toBe("LIMIT");
  });
  it("needs a name of at most 60 characters", () => {
    expect(checkNewPage({ name: "   ", pageCount: 1 })).toBe("NAME_REQUIRED");
    expect(checkNewPage({ name: "x".repeat(61), pageCount: 1 })).toBe("NAME_TOO_LONG");
    expect(checkNewPage({ name: " " + "x".repeat(60) + " ", pageCount: 1 })).toBe("OK");
  });
});

describe("replacedByPublish", () => {
  it("lists the public pages that go offline when another page is published", () => {
    expect(replacedByPublish(["main"], "p-1")).toEqual(["main"]);
    expect(replacedByPublish([], "p-1")).toEqual([]);
  });
  it("is empty when the page is already the public one", () => {
    expect(replacedByPublish(["p-1"], "p-1")).toEqual([]);
  });
});
