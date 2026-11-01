import { describe, expect, it } from "vitest";
import { MAX_LANDING_PAGES_PER_SHOP } from "@workshop/shared";
import { sitePage } from "@/lib/mock/data";
import { DRAFT_KEY, draftKeyFor, MAIN_PAGE_ID, PUBLISHED_KEY, publishedKeyFor } from "./draft-store";
import { addPage, parsePages, removePage, starterFor, touchPage, type PageMeta } from "./pages-store";

const NOW = "2026-11-01T00:00:00.000Z";
const main: PageMeta = { id: MAIN_PAGE_ID, name: "Clay & Co", slug: "clayco", template: "classic", createdAt: NOW, updatedAt: NOW };
const ctx = { takenSlugs: ["waxwick"], id: "p-1", now: NOW };
const input = { name: "Summer promo", slug: "clayco-summer", template: "quicklinks" } as const;

describe("storage keys", () => {
  it("the main page keeps the keys used before pages existed", () => {
    expect(draftKeyFor()).toBe(DRAFT_KEY);
    expect(draftKeyFor(MAIN_PAGE_ID)).toBe(DRAFT_KEY);
    expect(publishedKeyFor()).toBe(PUBLISHED_KEY);
  });
  it("every other page has its own draft and published keys", () => {
    expect(draftKeyFor("p-1")).not.toBe(draftKeyFor("p-2"));
    expect(draftKeyFor("p-1")).not.toBe(DRAFT_KEY);
    expect(publishedKeyFor("p-1")).not.toBe(PUBLISHED_KEY);
  });
});

describe("addPage", () => {
  it("adds the second page with a trimmed name and a normalized address", () => {
    const res = addPage([main], { ...input, name: "  Summer promo ", slug: " Clayco-Summer " }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pages).toHaveLength(2);
    expect(res.page).toMatchObject({ id: "p-1", name: "Summer promo", slug: "clayco-summer", template: "quicklinks" });
  });
  it(`never allows more than ${MAX_LANDING_PAGES_PER_SHOP} pages`, () => {
    const two = addPage([main], input, ctx);
    if (!two.ok) throw new Error("second page should be allowed");
    expect(addPage(two.pages, { ...input, slug: "clayco-other" }, { ...ctx, id: "p-2" })).toEqual({ ok: false, reason: "LIMIT" });
  });
  it("refuses an address used by another shop or by one of this shop's pages", () => {
    expect(addPage([main], { ...input, slug: "waxwick" }, ctx)).toEqual({ ok: false, reason: "SLUG_TAKEN" });
    expect(addPage([main], { ...input, slug: "clayco" }, ctx)).toEqual({ ok: false, reason: "SLUG_TAKEN" });
  });
  it("refuses a bad name or address and does not change the list", () => {
    const pages = [main];
    expect(addPage(pages, { ...input, name: " " }, ctx)).toEqual({ ok: false, reason: "NAME_REQUIRED" });
    expect(addPage(pages, { ...input, slug: "Bad Slug!" }, ctx)).toEqual({ ok: false, reason: "SLUG_INVALID" });
    expect(addPage(pages, { ...input, slug: "admin" }, ctx)).toEqual({ ok: false, reason: "SLUG_RESERVED" });
    expect(pages).toEqual([main]);
  });
});

describe("removePage", () => {
  const second: PageMeta = { ...main, id: "p-1", name: "Promo", slug: "clayco-promo" };
  it("removes a page that is not the main one, which frees a place", () => {
    const res = removePage([main, second], "p-1");
    expect(res).toEqual({ ok: true, pages: [main] });
    expect(addPage([main], input, ctx).ok).toBe(true);
  });
  it("keeps the main page and ignores unknown ids", () => {
    expect(removePage([main, second], MAIN_PAGE_ID)).toEqual({ ok: false, reason: "main" });
    expect(removePage([main, second], "nope")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("parsePages", () => {
  const raw = (v: unknown) => JSON.stringify(v);
  it("round-trips a saved list", () => {
    expect(parsePages(raw([main]))).toEqual([main]);
  });
  it("is null for nothing, corrupt JSON or something that is not a list", () => {
    expect(parsePages(null)).toBeNull();
    expect(parsePages("{")).toBeNull();
    expect(parsePages(raw({ id: "main" }))).toBeNull();
    expect(parsePages(raw([]))).toBeNull();
  });
  it("drops broken rows and repeated ids, and repairs an unknown template", () => {
    const pages = parsePages(raw([main, { ...main }, { id: "BAD ID", name: "x", slug: "x" }, { id: "p-2", name: "", slug: "s" }, 5, { id: "p-3", name: "Ok", slug: "ok-page", template: "gone" }]));
    expect(pages?.map((p) => p.id)).toEqual(["main", "p-3"]);
    expect(pages?.[1]?.template).toBe("classic");
  });
});

describe("touchPage and starterFor", () => {
  it("only changes the page that was edited", () => {
    const other: PageMeta = { ...main, id: "p-1" };
    const next = touchPage([main, other], "p-1", { template: "quicklinks", now: "2027-01-01T00:00:00.000Z" });
    expect(next[0]).toEqual(main);
    expect(next[1]).toMatchObject({ template: "quicklinks", updatedAt: "2027-01-01T00:00:00.000Z" });
  });
  it("a new page starts from the sample content laid out with its own template", () => {
    const d = starterFor({ content: sitePage.draft, theme: sitePage.theme }, "quicklinks");
    expect(d.template).toBe("quicklinks");
    expect(d.content.sections.length).toBeGreaterThan(0);
    expect(d.content.layout).not.toBeUndefined();
  });
});
