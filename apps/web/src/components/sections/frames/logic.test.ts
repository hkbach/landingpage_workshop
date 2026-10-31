import { describe, expect, it } from "vitest";
import type { SectionType } from "@workshop/shared";
import type { SectionInstance } from "@/lib/types";
import { sitePage } from "@/lib/mock/data";
import { createSection } from "../registry";
import { templateSections, TEMPLATE_KEYS } from "../templates";
import {
  chapterNumber, FALLBACK_FOOTER, groupIntoTabs, isRenderable, journeyRuns, navItems, planBento, splitSections, tabForHash,
} from "./logic";

const sec = (type: SectionType, props: Record<string, unknown> = {}, enabled = true): SectionInstance => {
  const s = createSection(type);
  return { ...s, enabled, props: { ...s.props, ...props } };
};
const full = (): SectionInstance[] => [
  sec("hero"), sec("about"), sec("team", { members: [{ name: "A", role: {}, bio: {}, imageUrl: "" }] }), sec("workshops"),
  sec("gallery", { imageUrls: ["https://example.com/a.jpg", "https://example.com/b.jpg"] }),
  sec("video", { videoId: "dQw4w9WgXcQ" }), sec("testimonials", { items: [{ name: "E", country: "GB", text: {} }] }),
  sec("faq"), sec("location"), sec("contact"), sec("footer"),
];

describe("splitSections", () => {
  it("separates enabled body sections from the footer and always returns a footer", () => {
    const { body, footer } = splitSections([sec("hero"), sec("about", {}, false), sec("footer", {}, false)]);
    expect(body.map((s) => s.type)).toEqual(["hero"]);
    expect(footer.type).toBe("footer");
    expect(footer.enabled).toBe(true);
    expect(splitSections([sec("hero")]).footer).toBe(FALLBACK_FOOTER);
  });
  it("every template has a footer", () => {
    for (const key of TEMPLATE_KEYS) {
      const { footer } = splitSections(templateSections(key));
      expect(footer.type).toBe("footer");
    }
  });
});

describe("isRenderable / navItems", () => {
  it("skips empty galleries, teams and invalid videos; the hero and footer are not nav items", () => {
    expect(isRenderable(sec("gallery"))).toBe(false);
    expect(isRenderable(sec("team"))).toBe(false);
    expect(isRenderable(sec("video", { videoId: "x" }))).toBe(false);
    const { body } = splitSections(full());
    const items = navItems(body);
    expect(items.some((i) => i.type === "hero" || i.type === "footer")).toBe(false);
    expect(items).toHaveLength(body.length - 1);
    expect(items[0]!.href).toBe(`#s-${body[1]!.id}`);
  });
});

describe("groupIntoTabs (App Style)", () => {
  it("covers every enabled section exactly once, with only non-empty tabs, in a stable tab order", () => {
    const { body } = splitSections(full());
    const tabs = groupIntoTabs(body);
    expect(tabs.map((t) => t.key)).toEqual(["overview", "workshops", "gallery", "info"]);
    const ids = tabs.flatMap((t) => t.sections.map((s) => s.id));
    expect([...ids].sort()).toEqual(body.map((s) => s.id).sort());
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("covers sections that draw nothing too, and drops empty tabs", () => {
    const body = [sec("hero"), sec("gallery"), sec("workshops")]; // empty gallery
    const tabs = groupIntoTabs(body);
    expect(tabs.map((t) => t.key)).toEqual(["overview", "workshops"]);
    expect(tabs.flatMap((t) => t.sections)).toHaveLength(3);
    expect(groupIntoTabs([])).toEqual([]);
  });
  it.each(TEMPLATE_KEYS)("%s default sections are covered exactly once", (key) => {
    const { body } = splitSections(templateSections(key));
    const ids = groupIntoTabs(body).flatMap((t) => t.sections.map((s) => s.id));
    expect([...ids].sort()).toEqual(body.map((s) => s.id).sort());
  });
  it("the mock page is covered exactly once", () => {
    const { body } = splitSections(sitePage.draft.sections);
    expect(groupIntoTabs(body).flatMap((t) => t.sections)).toHaveLength(body.length);
  });
  it("tabForHash finds the tab of a section or tab hash", () => {
    const { body } = splitSections(full());
    const tabs = groupIntoTabs(body);
    const faq = body.find((s) => s.type === "faq")!;
    expect(tabForHash(tabs, `#s-${faq.id}`)).toBe("info");
    expect(tabForHash(tabs, "#tab-gallery")).toBe("gallery");
    expect(tabForHash(tabs, "#tab-nope")).toBeNull();
    expect(tabForHash(tabs, "#other")).toBeNull();
    expect(tabForHash(tabs, "")).toBeNull();
  });
});

describe("planBento", () => {
  it("represents every renderable section, makes workshop and image tiles, and starts with the hero", () => {
    const { body } = splitSections(full());
    const tiles = planBento(body, { workshopCount: 2, imageCount: 12 });
    expect(tiles[0]!.section.type).toBe("hero");
    expect(tiles[0]!.size).toBe("xl");
    for (const s of body) expect(tiles.some((t) => t.section.id === s.id), s.type).toBe(true);
    expect(tiles.filter((t) => t.kind === "workshop")).toHaveLength(2);
    expect(tiles.filter((t) => t.kind === "image").length).toBeLessThanOrEqual(8);
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });
  it("falls back to a section tile when there are no workshops or photos", () => {
    const { body } = splitSections(full());
    const tiles = planBento(body, { workshopCount: 0, imageCount: 0 });
    expect(tiles.some((t) => t.kind === "workshop" || t.kind === "image")).toBe(false);
    expect(tiles.some((t) => t.section.type === "workshops")).toBe(true);
  });
});

describe("journeyRuns / chapterNumber", () => {
  it("groups consecutive sections into numbered steps without losing sections", () => {
    const { body } = splitSections(full());
    const runs = journeyRuns(body);
    expect(runs.map((r) => r.number)).toEqual(runs.map((_, i) => i + 1));
    expect(runs.flatMap((r) => r.sections)).toHaveLength(body.length);
    expect(runs[0]!.step).toBe("discover");
    expect(runs.at(-1)!.step).toBe("book");
  });
  it("pads chapter numbers", () => {
    expect(chapterNumber(0)).toBe("01");
    expect(chapterNumber(11)).toBe("12");
  });
});
