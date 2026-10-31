import { describe, expect, it } from "vitest";
import { SECTION_TYPES, type SectionType } from "@workshop/shared";
import type { PageContent, SectionInstance } from "@/lib/types";
import { sectionInstanceSchema } from "./instance";
import {
  ADDABLE_TYPES, createSection, effectiveVariant, hasContent, isValidVariant, SECTION_REGISTRY, validateSection,
} from "./registry";
import {
  applyTemplate, LEGACY_TEMPLATE_KEYS, planTemplateSwitch, resolveTemplateKey, TEMPLATE_KEYS, TEMPLATES, templateSections,
  themeForTemplate,
} from "./templates";
import { FRAMES } from "./frames";
import { DEFAULT_LAYOUT, LAYOUT_KEYS, resolveLayout } from "./layouts";
import { FONTS, themeChecks } from "./theme";

describe("template registry integrity", () => {
  it("has exactly 10 templates with unique keys, including classic", () => {
    expect(TEMPLATE_KEYS).toHaveLength(10);
    expect(new Set(TEMPLATE_KEYS).size).toBe(10);
    expect(Object.keys(TEMPLATES).sort()).toEqual([...TEMPLATE_KEYS].sort());
    expect(TEMPLATE_KEYS).toContain("classic");
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

  it("has 10 distinct layouts and every layout has a frame", () => {
    const layouts = TEMPLATE_KEYS.map((k) => TEMPLATES[k].layout);
    expect(new Set(layouts).size).toBe(10);
    expect([...layouts].sort()).toEqual([...LAYOUT_KEYS].sort());
    for (const l of LAYOUT_KEYS) expect(FRAMES[l], l).toBeTypeOf("function");
    expect(Object.keys(FRAMES).sort()).toEqual([...LAYOUT_KEYS].sort());
    expect(TEMPLATES[TEMPLATE_KEYS[0]].layout).toBe(DEFAULT_LAYOUT);
  });

  it("resolveLayout / resolveTemplateKey sanitise stale values", () => {
    expect(resolveLayout("nope")).toBe(DEFAULT_LAYOUT);
    expect(resolveLayout(undefined)).toBe(DEFAULT_LAYOUT);
    expect(resolveLayout("bento")).toBe("bento");
    expect(resolveTemplateKey("minimal")).toBe("quicklinks");
    expect(resolveTemplateKey("__proto__")).toBeUndefined();
    expect(resolveTemplateKey("nope")).toBeUndefined();
    for (const target of Object.values(LEGACY_TEMPLATE_KEYS)) expect(TEMPLATE_KEYS).toContain(target);
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
    const out = applyTemplate(content, "cinematic");
    const find = (t: SectionType) => out.sections.find((s) => s.type === t)!;
    expect(find("hero").id).toBe(hero.id);
    expect(find("hero").props).toEqual(hero.props);
    expect(find("hero").style).toEqual({ background: "#112233" });
    expect(find("hero").variant).toBe("fullscreen");
    expect(out.layout).toBe("cinematic");
    expect(find("faq").props).toEqual(faq.props);
    expect(find("faq").style).toEqual({ text: "#000000" });
    expect(find("faq").variant).toBe("two-column");
    expect(out.sections.map((s) => s.type)).toEqual(TEMPLATES.cinematic.sections.map((s) => s.type));
    expect(out.sections[out.sections.length - 1]!.type).toBe("footer");
  });

  it("keeps extra sections of a type with content as disabled, drops untouched ones", () => {
    // Every template lists each section type once, so a second section of the same type is unlisted.
    const team2 = make("team", { members: [{ name: "Linh", role: {}, bio: {}, imageUrl: "" }] });
    const gallery2 = createSection("gallery"); // untouched defaults
    const content = pageWith([createSection("hero"), createSection("team"), team2, createSection("gallery"), gallery2, createSection("footer")]);
    const plan = planTemplateSwitch(content, "quicklinks");
    expect(plan.hidden).toEqual(["team"]);
    expect(plan.removed).toEqual(["gallery"]);
    const kept = plan.sections.find((s) => s.id === team2.id)!;
    expect(kept.enabled).toBe(false);
    expect(kept.props).toEqual(team2.props);
    expect(plan.sections.find((s) => s.id === gallery2.id)).toBeUndefined();
    expect(plan.sections[plan.sections.length - 1]!.type).toBe("footer");
  });

  it.each(TEMPLATE_KEYS)("%s: keeps every section's props and colour overrides and always has one enabled footer", (key) => {
    const styled = (["hero", "about", "workshops", "faq"] as SectionType[]).map((t, i) =>
      make(t, {}, { style: { background: "#112233", text: "#ffffff", accent: i % 2 ? "#ffcc00" : "#00aa88" } }));
    const video = make("video", { videoId: "dQw4w9WgXcQ" });
    const content = pageWith([...styled, video, createSection("footer")]);
    const out = applyTemplate(content, key);
    expect(out.layout).toBe(TEMPLATES[key].layout);
    for (const original of [...styled, video]) {
      const kept = out.sections.find((x) => x.id === original.id)!;
      expect(kept.props).toEqual(original.props);
      expect(kept.style).toEqual(original.style);
    }
    const footers = out.sections.filter((x) => x.type === "footer");
    expect(footers).toHaveLength(1);
    expect(footers[0]!.enabled).toBe(true);
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
    const out = applyTemplate(pageWith([createSection("hero")]), "cinematic");
    expect(out.sections[out.sections.length - 1]!.type).toBe("footer");
    const theme = themeForTemplate("cinematic", { logoUrl: "https://example.com/l.png", faviconUrl: "https://example.com/f.png" });
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
