import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_LANDING_PAGES_PER_SHOP } from "@workshop/shared";
import { sitePage } from "@/lib/sample/data";
import { DRAFT_KEY, draftKeyFor, MAIN_PAGE_ID, PUBLISHED_KEY, publishedKeyFor } from "./draft-store";
import { addPage, clearPageContent, DEFAULT_TEMPLATE, LIVE_KEY, loadLivePageId, loadPages, parsePages, removePage, setLivePage, starterFor, touchPage, type PageMeta } from "./pages-store";

const NOW = "2026-11-01T00:00:00.000Z";
const main: PageMeta = { id: MAIN_PAGE_ID, name: "Clay & Co", template: "classic", createdAt: NOW, updatedAt: NOW };
const ctx = { id: "p-1", now: NOW };

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), keys: () => [...m.keys()] };
}
let store = fakeStorage();
beforeEach(() => { store = fakeStorage(); vi.stubGlobal("window", { localStorage: store }); });

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

describe("addPage: only a name is needed", () => {
  it("adds the second page with a trimmed name and the default template", () => {
    const res = addPage([main], { name: "  Summer promo " }, ctx);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.pages).toHaveLength(2);
    expect(res.page).toMatchObject({ id: "p-1", name: "Summer promo", template: DEFAULT_TEMPLATE });
  });
  it(`never allows more than ${MAX_LANDING_PAGES_PER_SHOP} pages`, () => {
    const two = addPage([main], { name: "Promo" }, ctx);
    if (!two.ok) throw new Error("second page should be allowed");
    expect(addPage(two.pages, { name: "Third" }, { ...ctx, id: "p-2" })).toEqual({ ok: false, reason: "LIMIT" });
  });
  it("refuses an empty or too long name and does not change the list", () => {
    const pages = [main];
    expect(addPage(pages, { name: " " }, ctx)).toEqual({ ok: false, reason: "NAME_REQUIRED" });
    expect(addPage(pages, { name: "x".repeat(61) }, ctx)).toEqual({ ok: false, reason: "NAME_TOO_LONG" });
    expect(pages).toEqual([main]);
  });
});

describe("removePage", () => {
  const second: PageMeta = { ...main, id: "p-1", name: "Promo" };
  it("removes a page that is not the main one, which frees a place", () => {
    expect(removePage([main, second], "p-1")).toEqual({ ok: true, pages: [main] });
    expect(addPage([main], { name: "Again" }, ctx).ok).toBe(true);
  });
  it("keeps the main page and ignores unknown ids", () => {
    expect(removePage([main, second], MAIN_PAGE_ID)).toEqual({ ok: false, reason: "main" });
    expect(removePage([main, second], "nope")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("parsePages", () => {
  const raw = (v: unknown) => JSON.stringify(v);
  it("round-trips a saved list and ignores the address that earlier versions stored", () => {
    expect(parsePages(raw([main]))).toEqual([main]);
    expect(parsePages(raw([{ ...main, slug: "old" }]))).toEqual([main]);
  });
  it("is null for nothing, corrupt JSON or something that is not a list", () => {
    expect(parsePages(null)).toBeNull();
    expect(parsePages("{")).toBeNull();
    expect(parsePages(raw({ id: "main" }))).toBeNull();
    expect(parsePages(raw([]))).toBeNull();
  });
  it("drops broken rows and repeated ids, and repairs an unknown template", () => {
    const pages = parsePages(raw([main, { ...main }, { id: "BAD ID", name: "x" }, { id: "p-2", name: "" }, 5, { id: "p-3", name: "Ok", template: "gone" }]));
    expect(pages?.map((p) => p.id)).toEqual(["main", "p-3"]);
    expect(pages?.[1]?.template).toBe("classic");
  });
});

describe("loadPages", () => {
  it("always has the main page, first", () => {
    expect(loadPages({ name: "Clay & Co", template: "classic" }, NOW).map((p) => p.id)).toEqual([MAIN_PAGE_ID]);
    store.setItem("builder:pages:v1", JSON.stringify([{ ...main, id: "p-1", name: "Promo" }]));
    expect(loadPages({ name: "Clay & Co", template: "classic" }, NOW).map((p) => p.id)).toEqual([MAIN_PAGE_ID, "p-1"]);
  });
});

describe("seed pages (mock data)", () => {
  const seed = [{ id: "p-summer", name: "Summer", template: "magazine" as const }];
  it("a shop that never saved its list starts with the main page and the seed pages", () => {
    expect(loadPages({ name: "Clay", template: "classic", seed }, NOW).map((p) => [p.id, p.template])).toEqual([[MAIN_PAGE_ID, "classic"], ["p-summer", "magazine"]]);
  });
  it("a saved list wins: pages the shop deleted do not come back", () => {
    store.setItem("builder:pages:v1", JSON.stringify([main]));
    expect(loadPages({ name: "Clay", template: "classic", seed }, NOW).map((p) => p.id)).toEqual([MAIN_PAGE_ID]);
  });
});

describe("the public page: only one at a time", () => {
  it("is the main page for a shop that is live, and nothing for a shop that is not", () => {
    expect(loadLivePageId(true)).toBe(MAIN_PAGE_ID);
    expect(loadLivePageId(false)).toBeNull();
  });
  it("publishing a page makes it the only public one and reports the page it replaced", () => {
    expect(setLivePage("p-1", true)).toEqual({ ok: true, replaced: [MAIN_PAGE_ID] });
    expect(loadLivePageId(true)).toBe("p-1");
    expect(setLivePage(MAIN_PAGE_ID, true)).toEqual({ ok: true, replaced: ["p-1"] });
    expect(store.getItem(LIVE_KEY)).toBe(MAIN_PAGE_ID);
  });
  it("replaces nothing when the page is already public or no page is", () => {
    setLivePage("p-1", false);
    expect(setLivePage("p-1", false)).toEqual({ ok: true, replaced: [] });
    expect(setLivePage("p-1", false).replaced).toEqual([]);
  });
  it("reports a failure when storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} } });
    expect(setLivePage("p-1", false)).toEqual({ ok: false, replaced: [] });
  });
  it("deleting the public page leaves no public page, and removes its content", () => {
    store.setItem(draftKeyFor("p-1"), "d");
    store.setItem(publishedKeyFor("p-1"), "p");
    setLivePage("p-1", false);
    clearPageContent("p-1");
    expect(store.keys()).toEqual([]);
    expect(loadLivePageId(false)).toBeNull();
  });
  it("deleting another page keeps the public page", () => {
    setLivePage(MAIN_PAGE_ID, true);
    clearPageContent("p-1");
    expect(loadLivePageId(false)).toBe(MAIN_PAGE_ID);
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
