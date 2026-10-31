import { describe, expect, it } from "vitest";
import { SECTION_TYPES, type SectionType } from "@workshop/shared";
import type { PageContent, SectionInstance } from "@/lib/types";
import { sectionInstanceSchema } from "./instance";
import {
  ADDABLE_TYPES, createSection, effectiveVariant, hasContent, isValidVariant, SECTION_REGISTRY, validateSection,
} from "./registry";
import {
  applyTemplate, planTemplateSwitch, TEMPLATE_KEYS, TEMPLATES, templateSections, themeForTemplate,
} from "./templates";
import { FONTS, themeChecks } from "./theme";

describe("template registry integrity", () => {
  it("has exactly 10 templates with unique keys, including classic and minimal", () => {
    expect(TEMPLATE_KEYS).toHaveLength(10);
    expect(new Set(TEMPLATE_KEYS).size).toBe(10);
    expect(Object.keys(TEMPLATES).sort()).toEqual([...TEMPLATE_KEYS].sort());
    expect(TEMPLATE_KEYS).toContain("classic");
    expect(TEMPLATE_KEYS).toContain("minimal");
    for (const k of TEMPLATE_KEYS) expect(TEMPLATES[k].key).toBe(k);
  });

  it("registry covers all 11 section types, including video", () => {
    expect(SECTION_TYPES).toHaveLength(11);
    expect(SECTION_TYPES).toContain("video");
    expect(Object.keys(SECTION_REGISTRY).sort()).toEqual([...SECTION_TYPES].sort());
    expect(ADDABLE_TYPES).toContain("video");
  });

  it.each(TEMPLATE_KEYS)("%s: sections, variants and footer are valid", (key) => {
    const t = TEMPLATES[key];
    const types = t.sections.map((s) => s.type);
    expect(types[types.length - 1]).toBe("footer");
    expect(types.filter((x) => x === "footer")).toHaveLength(1);
    expect(new Set(types).size).toBe(types.length); // one section per type
    expect(t.sections.find((s) => s.type === "hero")).toBeDefined();
    for (const s of t.sections) expect(isValidVariant(s.type, s.variant), `${s.type}:${s.variant}`).toBe(true);
    // the footer is always on
    expect(t.sections.find((s) => s.type === "footer")?.enabled).not.toBe(false);
  });

  it.each(TEMPLATE_KEYS)("%s: every default section validates against its registry schema and instance schema", (key) => {
    for (const s of templateSections(key)) {
      expect(validateSection(s.type, s.props), s.type).toEqual([]);
      expect(sectionInstanceSchema.safeParse(s).success, s.type).toBe(true);
    }
  });

  it.each(TEMPLATE_KEYS)("%s: palette and primary colours pass 4.5:1 and the font is allowed", (key) => {
    const theme = TEMPLATES[key].theme;
    const failing = themeChecks(theme).filter((c) => !c.ok);
    expect(failing, failing.map((c) => `${c.id} ${c.ratio.toFixed(2)}`).join(", ")).toEqual([]);
    expect(FONTS.some((f) => f.key === theme.font)).toBe(true);
  });

  it("templates are distinct (layout + palette + font + order)", () => {
    const sig = TEMPLATE_KEYS.map((k) => JSON.stringify([TEMPLATES[k].sections, TEMPLATES[k].theme]));
    expect(new Set(sig).size).toBe(10);
    expect(new Set(TEMPLATE_KEYS.map((k) => TEMPLATES[k].theme.palette)).size).toBe(10);
  });

  it("only some templates include the video section by default", () => {
    const withVideo = TEMPLATE_KEYS.filter((k) => TEMPLATES[k].sections.some((s) => s.type === "video" && s.enabled !== false));
    expect(withVideo.length).toBeGreaterThan(0);
    expect(withVideo.length).toBeLessThan(10);
  });

  it("every registry variant list is non-empty and falls back to the default", () => {
    for (const type of SECTION_TYPES) {
      const def = SECTION_REGISTRY[type];
      expect(def.variants.length).toBeGreaterThan(0);
      expect(effectiveVariant({ type, variant: "nope" })).toBe(def.variants[0]);
      expect(effectiveVariant({ type })).toBe(def.variants[0]);
    }
  });
});

describe("instance schema", () => {
  const base = (over: Partial<SectionInstance>) => ({ ...createSection("about"), ...over });
  it("rejects unknown variants and invalid style colours", () => {
    expect(sectionInstanceSchema.safeParse(base({ variant: "zigzag" })).success).toBe(false);
    expect(sectionInstanceSchema.safeParse(base({ style: { text: "red" } })).success).toBe(false);
    expect(sectionInstanceSchema.safeParse(base({ style: { text: "#abc", accent: "#A1B2C3" } })).success).toBe(true);
  });
  it("rejects a data: image in the strict (public) schema but accepts it in the builder schema", () => {
    const props = { ...createSection("about").props, imageUrl: "data:image/png;base64,iVBORw0KGgo=" };
    expect(validateSection("about", props)).not.toEqual([]);
    expect(validateSection("about", props, { allowDataImages: true })).toEqual([]);
  });
  it("video stores only a valid 11-char id", () => {
    const ok = { heading: {}, caption: {}, videoId: "dQw4w9WgXcQ" };
    expect(validateSection("video", ok)).toEqual([]);
    expect(validateSection("video", { ...ok, videoId: "https://youtu.be/dQw4w9WgXcQ" })).not.toEqual([]);
    expect(validateSection("video", { ...ok, videoId: "" })).toEqual([]);
  });
});

describe("template switch preserves content", () => {
  function pageWith(sections: SectionInstance[]): PageContent {
    return { schemaVersion: 1, seo: { title: {}, description: {} }, sections };
  }
  const make = (type: SectionType, props: Record<string, unknown>, extra: Partial<SectionInstance> = {}): SectionInstance => ({
    ...createSection(type), props: { ...createSection(type).props, ...props }, ...extra,
  });

  it("keeps props and per-section style, resets variants and follows the template order", () => {
    const hero = make("hero", { title: { en: "My title" }, imageUrl: "https://example.com/h.jpg" }, { variant: "split", style: { background: "#112233" } });
    const faq = make("faq", { heading: { en: "Questions" } }, { style: { text: "#000000" } });
    const content = pageWith([hero, faq, createSection("footer")]);
    const out = applyTemplate(content, "bold");
    const find = (t: SectionType) => out.sections.find((s) => s.type === t)!;
    expect(find("hero").id).toBe(hero.id);
    expect(find("hero").props).toEqual(hero.props);
    expect(find("hero").style).toEqual({ background: "#112233" });
    expect(find("hero").variant).toBe("overlay-left");
    expect(find("faq").props).toEqual(faq.props);
    expect(find("faq").style).toEqual({ text: "#000000" });
    expect(find("faq").variant).toBe("two-column");
    expect(out.sections.map((s) => s.type)).toEqual(TEMPLATES.bold.sections.map((s) => s.type));
    expect(out.sections[out.sections.length - 1]!.type).toBe("footer");
  });

  it("keeps unlisted sections that have content as disabled, drops untouched ones", () => {
    const team = make("team", { members: [{ name: "Linh", role: {}, bio: {}, imageUrl: "" }] });
    const gallery = createSection("gallery"); // untouched defaults
    const video = make("video", { videoId: "dQw4w9WgXcQ" });
    const content = pageWith([createSection("hero"), team, gallery, video, createSection("footer")]);
    const plan = planTemplateSwitch(content, "minimal"); // minimal lists neither team, gallery nor video
    expect(plan.hidden.sort()).toEqual(["team", "video"]);
    expect(plan.removed).toEqual(["gallery"]);
    const keptTeam = plan.sections.find((s) => s.id === team.id)!;
    expect(keptTeam.enabled).toBe(false);
    expect(keptTeam.props).toEqual(team.props);
    expect(plan.sections.find((s) => s.id === video.id)?.props.videoId).toBe("dQw4w9WgXcQ");
    expect(plan.sections.find((s) => s.id === gallery.id)).toBeUndefined();
    expect(plan.sections[plan.sections.length - 1]!.type).toBe("footer");
  });

  it("never loses content across a round trip through every template", () => {
    const about = make("about", { body: { en: "Our story" }, imageUrl: "https://example.com/a.jpg" });
    const team = make("team", { members: [{ name: "Linh", role: { en: "Founder" }, bio: {}, imageUrl: "" }] });
    const video = make("video", { videoId: "dQw4w9WgXcQ", caption: { en: "Hi" } });
    let content = pageWith([createSection("hero"), about, team, video, createSection("footer")]);
    for (const key of [...TEMPLATE_KEYS, "classic" as const]) content = applyTemplate(content, key);
    for (const original of [about, team, video]) {
      const kept = content.sections.find((s) => s.id === original.id);
      expect(kept, original.type).toBeDefined();
      expect(kept!.props).toEqual(original.props);
    }
  });

  it("adds sections the template lists but the page lacks, with defaults", () => {
    const plan = planTemplateSwitch(pageWith([createSection("hero"), createSection("footer")]), "classic");
    expect(plan.added).toContain("workshops");
    expect(plan.sections.map((s) => s.type)).toEqual(TEMPLATES.classic.sections.map((s) => s.type));
  });

  it("adds a footer when the draft has none and keeps the logo and favicon in the theme", () => {
    const out = applyTemplate(pageWith([createSection("hero")]), "noir");
    expect(out.sections[out.sections.length - 1]!.type).toBe("footer");
    const theme = themeForTemplate("noir", { logoUrl: "https://example.com/l.png", faviconUrl: "https://example.com/f.png" });
    expect(theme.logoUrl).toBe("https://example.com/l.png");
    expect(theme.palette).toBe("noir");
  });

  it("hasContent: defaults are untouched, edits count, auto-content sections never do", () => {
    expect(hasContent(createSection("about"))).toBe(false);
    expect(hasContent(createSection("faq"))).toBe(false);
    expect(hasContent(make("about", { body: { en: "x" } }))).toBe(true);
    expect(hasContent(createSection("workshops"))).toBe(false);
  });
});
