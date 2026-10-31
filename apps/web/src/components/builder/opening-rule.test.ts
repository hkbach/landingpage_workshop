import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sitePage } from "@/lib/mock/data";
import {
  chooseInitialDraft, DRAFT_KEY, loadDraft, loadPublished, PUBLISHED_KEY, saveDraft, savePublished, type Draft,
} from "./draft-store";

// Opening rule of the website builder: last saved draft > published version > template starter.

const base = (): Draft => ({ content: structuredClone(sitePage.draft), theme: { ...sitePage.theme }, template: sitePage.template });
/** A draft whose hero title differs, so that we can tell which one is shown. */
const withTitle = (title: string): Draft => {
  const d = base();
  d.content.sections = d.content.sections.map((s) => (s.type === "hero" ? { ...s, props: { ...s.props, title: { en: title } } } : s));
  return d;
};
const heroTitle = (d: Draft) => (d.content.sections.find((s) => s.type === "hero")?.props.title as { en: string }).en;

describe("chooseInitialDraft", () => {
  const saved = withTitle("Saved draft");
  const published = withTitle("Published");
  const starter = withTitle("Starter");

  it("a saved draft wins over everything", () => {
    expect(chooseInitialDraft({ saved, published, starter })).toEqual({ draft: saved, source: "draft" });
    expect(chooseInitialDraft({ saved, published: null, starter })).toEqual({ draft: saved, source: "draft" });
  });
  it("without a draft, a public page shows its published version", () => {
    expect(chooseInitialDraft({ saved: null, published, starter })).toEqual({ draft: published, source: "published" });
  });
  it("only a shop with neither starts from the template starter", () => {
    expect(chooseInitialDraft({ saved: null, published: null, starter })).toEqual({ draft: starter, source: "starter" });
  });
  it("unpublished changes are never replaced by older published content", () => {
    expect(heroTitle(chooseInitialDraft({ saved: withTitle("Newer, not published yet"), published: withTitle("Old live"), starter }).draft)).toBe("Newer, not published yet");
  });
});

/** A minimal localStorage in the node test environment. */
function fakeStorage(overrides: Partial<Storage> = {}) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    ...overrides,
  } as Storage;
  return { storage, data };
}

describe("published version and saved draft storage", () => {
  let store: ReturnType<typeof fakeStorage>;
  beforeEach(() => { store = fakeStorage(); vi.stubGlobal("window", { localStorage: store.storage }); });
  afterEach(() => vi.unstubAllGlobals());

  /** What the builder does when it opens. */
  const open = (serverPublished: Draft | null, starter: Draft) =>
    chooseInitialDraft({ saved: loadDraft(), published: loadPublished() ?? serverPublished, starter });

  it("savePublished and saveDraft use different keys and do not touch each other", () => {
    savePublished(withTitle("Live"));
    expect(store.data.has(PUBLISHED_KEY)).toBe(true);
    expect(store.data.has(DRAFT_KEY)).toBe(false);
    saveDraft(withTitle("Draft"));
    expect(heroTitle(loadPublished()!)).toBe("Live");
    expect(heroTitle(loadDraft()!)).toBe("Draft");
  });

  it("loadPublished is null when nothing was published or the stored value is corrupt", () => {
    expect(loadPublished()).toBeNull();
    store.data.set(PUBLISHED_KEY, "{not json");
    expect(loadPublished()).toBeNull();
  });

  it("a blocked or full storage is reported, never thrown", () => {
    const blocked = fakeStorage({ setItem: () => { throw new Error("blocked"); } });
    vi.stubGlobal("window", { localStorage: blocked.storage });
    expect(savePublished(withTitle("x"))).toEqual({ ok: false, reason: "unavailable" });
    const quota = fakeStorage({ setItem: () => { throw new DOMException("full", "QuotaExceededError"); } });
    vi.stubGlobal("window", { localStorage: quota.storage });
    expect(savePublished(withTitle("x"))).toEqual({ ok: false, reason: "quota" });
  });

  it("full journey of a shop that is already live", () => {
    const live = withTitle("Live on the server");
    const starter = withTitle("Template starter");

    // 1) first visit, no draft: the published website is shown
    expect(open(live, starter)).toMatchObject({ source: "published" });
    expect(heroTitle(open(live, starter).draft)).toBe("Live on the server");

    // 2) the owner edits and the draft is saved: reopening shows that last saved draft
    saveDraft(withTitle("Edit 1"));
    expect(open(live, starter)).toMatchObject({ source: "draft" });
    expect(heroTitle(open(live, starter).draft)).toBe("Edit 1");

    // 3) more edits: the LAST saved draft is shown
    saveDraft(withTitle("Edit 2"));
    expect(heroTitle(open(live, starter).draft)).toBe("Edit 2");

    // 4) publish: the draft is copied to the published version
    savePublished(loadDraft()!);
    expect(heroTitle(loadPublished()!)).toBe("Edit 2");

    // 5) the draft is gone (new device, cleared draft): the page that is public is shown, as published
    store.data.delete(DRAFT_KEY);
    expect(open(live, starter)).toMatchObject({ source: "published" });
    expect(heroTitle(open(live, starter).draft)).toBe("Edit 2");

    // 6) a later draft that is not published must win over the older published version
    saveDraft(withTitle("Edit 3 (not published)"));
    expect(heroTitle(open(live, starter).draft)).toBe("Edit 3 (not published)");
    expect(heroTitle(loadPublished()!)).toBe("Edit 2"); // the live page did not change
  });

  it("a shop that is not published yet starts from the template and then follows its drafts", () => {
    const starter = withTitle("Template starter");
    expect(open(null, starter)).toMatchObject({ source: "starter" });
    saveDraft(withTitle("First draft"));
    expect(open(null, starter)).toMatchObject({ source: "draft" });
    expect(heroTitle(open(null, starter).draft)).toBe("First draft");
  });
});
