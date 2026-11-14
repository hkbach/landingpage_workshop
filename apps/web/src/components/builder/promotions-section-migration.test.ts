import { beforeEach, describe, expect, it, vi } from "vitest";
import { sitePage } from "@/lib/sample/data";
import { addPromotionsSection, DRAFT_KEY, draftKeyFor, loadDraft, loadPublished, MAIN_PAGE_ID, publishedKeyFor, saveDraft, type Draft } from "./draft-store";

// Content saved before the Promotions section existed gets the section once, so the shop owner finds it in the builder.

const full: Draft = { content: sitePage.draft, theme: sitePage.theme, template: sitePage.template };
const types = (d: Draft | null) => d?.content.sections.map((s) => s.type) ?? [];
const without = (d: Draft): Draft => ({ ...d, content: { ...d.content, sections: d.content.sections.filter((s) => s.type !== "promotions") } });
const old = without(full);

const m = new Map<string, string>();
beforeEach(() => {
  m.clear();
  vi.stubGlobal("window", { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } });
});

describe("addPromotionsSection", () => {
  it("puts the section right after the workshops, and keeps the footer last", () => {
    const next = addPromotionsSection(old);
    const t = types(next);
    expect(t[t.indexOf("workshops") + 1]).toBe("promotions");
    expect(t[t.length - 1]).toBe("footer");
    expect(t.filter((x) => x === "promotions")).toHaveLength(1);
    expect(next.content.sections.find((s) => s.type === "promotions")?.enabled).toBe(true);
  });
  it("goes before the footer when there is no workshops section", () => {
    const noWorkshops = { ...old, content: { ...old.content, sections: old.content.sections.filter((s) => s.type !== "workshops") } };
    const t = types(addPromotionsSection(noWorkshops));
    expect(t.indexOf("promotions")).toBe(t.length - 2);
    expect(t[t.length - 1]).toBe("footer");
  });
  it("leaves a page that already has the section as it is", () => {
    expect(addPromotionsSection(full)).toBe(full);
  });
  it("does not change the other sections", () => {
    const next = addPromotionsSection(old);
    expect(next.content.sections.filter((s) => s.type !== "promotions")).toEqual(old.content.sections);
  });
});

describe("loading saved content", () => {
  it("adds the section to an old draft once, and saves it", () => {
    saveDraft(old);
    const first = loadDraft();
    expect(types(first)).toContain("promotions");
    expect(JSON.parse(m.get(DRAFT_KEY)!).content.sections.some((s: { type: string }) => s.type === "promotions")).toBe(true);
    expect(types(loadDraft())).toContain("promotions"); // still there on the next load, from what was saved
  });
  it("respects the shop owner removing the section afterwards", () => {
    saveDraft(old);
    loadDraft();
    saveDraft(old); // the shop owner removed it and the autosave stored that
    expect(types(loadDraft())).not.toContain("promotions");
  });
  it("does not touch a draft that already has the section, and finds no draft when there is none", () => {
    saveDraft(full);
    expect(loadDraft()).toEqual(expect.objectContaining({ template: full.template }));
    expect(types(loadDraft()).filter((t) => t === "promotions")).toHaveLength(1);
    m.clear();
    expect(loadDraft()).toBeNull();
  });
  it("does the same for the published version, and for each page on its own", () => {
    m.set(publishedKeyFor(), JSON.stringify(old));
    expect(types(loadPublished())).toContain("promotions");
    m.set(draftKeyFor("p-1"), JSON.stringify(old));
    m.set(draftKeyFor(), JSON.stringify(old));
    expect(types(loadDraft("p-1"))).toContain("promotions");
    expect(types(loadDraft(MAIN_PAGE_ID))).toContain("promotions");
  });
  it("still opens a draft when storage is blocked for writing", () => {
    m.set(draftKeyFor(), JSON.stringify(old));
    vi.stubGlobal("window", { localStorage: { getItem: (k: string) => m.get(k) ?? null, setItem: () => { throw new Error("blocked"); }, removeItem: () => {} } });
    expect(types(loadDraft())).not.toContain("promotions");
    expect(loadDraft()?.template).toBe(old.template);
  });
});
