import { describe, expect, it } from "vitest";
import { sitePage } from "@/lib/mock/data";
import { DRAFT_KEY, parseDraft, sanitizeDraft } from "./draft-store";
import { TEMPLATES } from "@/components/sections/templates";
import { sectionInstanceSchema, needsAttention } from "@/components/sections/instance";

const valid = () => ({ content: sitePage.draft, theme: sitePage.theme, template: sitePage.template });

describe("draft store", () => {
  it("uses a bumped storage key", () => {
    expect(DRAFT_KEY).toBe("builder:draft:v3");
  });

  it("round-trips the mock draft", () => {
    const d = parseDraft(JSON.stringify(valid()));
    expect(d?.template).toBe(sitePage.template);
    expect(d?.content.layout).toBe(sitePage.draft.layout);
    expect(d?.content.sections.length).toBe(sitePage.draft.sections.length);
  });

  it("mock draft: all sections valid, includes a video section with an id, no contrast failures", () => {
    for (const s of sitePage.draft.sections) {
      expect(sectionInstanceSchema.safeParse(s).success, s.type).toBe(true);
      expect(needsAttention(s, sitePage.theme), s.type).toBe(false);
    }
    const videos = sitePage.draft.sections.find((s) => s.type === "video")?.props.videos as string[];
    expect(videos[0]).toBe("dQw4w9WgXcQ");
    expect(videos.length).toBeLessThanOrEqual(5);
  });

  it.each([
    ["null", "null"],
    ["not json", "{oops"],
    ["empty", ""],
    ["v1 shape without sections", JSON.stringify({ content: { schemaVersion: 1 }, theme: {} })],
    ["wrong schema version", JSON.stringify({ ...valid(), content: { ...sitePage.draft, schemaVersion: 2 } })],
    ["no usable sections", JSON.stringify({ ...valid(), content: { ...sitePage.draft, sections: [{ nope: true }] } })],
  ])("returns null for invalid stored drafts: %s", (_n, raw) => {
    expect(parseDraft(raw)).toBeNull();
  });

  it("repairs an old-shaped theme (primary only) and drops invalid colours, variants and styles", () => {
    const old = {
      template: "classic",
      theme: { palette: "warm", primary: "#9a3412", font: "Comic Sans", logoUrl: "javascript:alert(1)" },
      content: {
        schemaVersion: 1, seo: {},
        sections: [
          { id: "a", type: "hero", enabled: true, variant: "zigzag", props: {}, style: { text: "red", background: "#FFF" } },
          { id: "b", type: "bogus", enabled: true, props: {} },
        ],
      },
    };
    const d = sanitizeDraft(old)!;
    expect(d.theme.background).toBe("#fffaf5");
    expect(d.theme.font).toBe("Inter");
    expect(d.theme.logoUrl).toBeUndefined();
    const hero = d.content.sections.find((s) => s.id === "a")!;
    expect(hero.variant).toBeUndefined();
    expect(hero.style).toEqual({ background: "#ffffff" });
    expect(d.content.sections.some((s) => s.id === "b")).toBe(false);
    expect(d.content.sections.at(-1)?.type).toBe("footer"); // footer is added when missing
  });

  it("falls back to classic for an unknown template key", () => {
    const stale = { ...valid(), template: "nope", content: { ...sitePage.draft, layout: undefined } };
    expect(sanitizeDraft(stale)?.template).toBe("classic");
    expect(sanitizeDraft(stale)?.content.layout).toBe("classic");
  });

  it("maps legacy template keys and derives the layout from the template", () => {
    const old = { ...valid(), template: "minimal", content: { ...sitePage.draft, layout: undefined } };
    const d = sanitizeDraft(old)!;
    expect(d.template).toBe("quicklinks");
    expect(d.content.layout).toBe("quicklinks");
  });

  it("sanitises an invalid layout and keeps a valid one", () => {
    const own = TEMPLATES[sitePage.template].layout;
    expect(sanitizeDraft({ ...valid(), content: { ...sitePage.draft, layout: "<script>" } })?.content.layout).toBe(own);
    expect(sanitizeDraft({ ...valid(), content: { ...sitePage.draft, layout: 42 } })?.content.layout).toBe(own);
    expect(sanitizeDraft({ ...valid(), content: { ...sitePage.draft, layout: "magazine" } })?.content.layout).toBe("magazine");
  });
});

describe("draft store: single video -> video list migration", () => {
  const withVideoProps = (props: Record<string, unknown>) => {
    const d = valid();
    return {
      ...d,
      content: { ...d.content, sections: d.content.sections.map((s) => (s.type === "video" ? { ...s, props } : s)) },
    };
  };
  const videoOf = (raw: unknown) => parseDraft(JSON.stringify(raw))?.content.sections.find((s) => s.type === "video");

  it("upgrades a stored v1 draft (videoId) to videos: [id] without losing the video", () => {
    const v = videoOf(withVideoProps({ heading: { en: "H" }, caption: {}, videoId: "dQw4w9WgXcQ" }));
    expect(v?.props.videos).toEqual(["dQw4w9WgXcQ"]);
    expect("videoId" in (v?.props ?? {})).toBe(false);
    expect(v?.props.heading).toEqual({ en: "H" });
  });

  it("a v1 draft without a video becomes an empty list", () => {
    expect(videoOf(withVideoProps({ heading: {}, caption: {}, videoId: "" }))?.props.videos).toEqual([]);
  });

  it("keeps a v2 list and clamps anything above five", () => {
    const ids = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd", "eeeeeeeeeee", "fffffffffff", "ggggggggggg"];
    expect(videoOf(withVideoProps({ heading: {}, caption: {}, videos: ids.slice(0, 3) }))?.props.videos).toEqual(ids.slice(0, 3));
    expect(videoOf(withVideoProps({ heading: {}, caption: {}, videos: ids }))?.props.videos).toEqual(ids.slice(0, 5));
  });
});

describe("draft store: hero first, footer last", () => {
  const reorder = (order: string[]) => {
    const d = valid();
    const byType = new Map(d.content.sections.map((s) => [s.type, s]));
    return { ...d, content: { ...d.content, sections: order.map((t) => byType.get(t as never)!).filter(Boolean) } };
  };
  const typesOf = (raw: unknown) => parseDraft(JSON.stringify(raw))?.content.sections.map((s) => s.type);

  it("repairs a stored draft whose hero is not first and whose footer is not last", () => {
    const order = typesOf(reorder(["about", "footer", "workshops", "hero", "faq"]));
    expect(order?.[0]).toBe("hero");
    expect(order?.[order.length - 1]).toBe("footer");
    expect(order?.slice(1, -1)).toEqual(["about", "workshops", "faq"]);
  });

  it("leaves a valid order untouched", () => {
    expect(typesOf(reorder(["hero", "faq", "about", "footer"]))).toEqual(["hero", "faq", "about", "footer"]);
  });
});

describe("draft store: one Chinese language", () => {
  const withProps = (heroTitle: Record<string, string>) => {
    const d = valid();
    return {
      ...d,
      content: {
        ...d.content,
        seo: { title: { en: "T", "zh-TW": "標題" }, description: { en: "D" } },
        sections: d.content.sections.map((s) => (s.type === "hero" ? { ...s, props: { ...s.props, title: heroTitle } } : s)),
      },
    };
  };
  const parsed = (raw: unknown) => parseDraft(JSON.stringify(raw));

  it("folds text stored under the old zh-TW key into zh, in sections and in the SEO fields", () => {
    const d = parsed(withProps({ en: "Hello", "zh-TW": "你好" }));
    const hero = d?.content.sections.find((s) => s.type === "hero");
    expect(hero?.props.title).toEqual({ en: "Hello", zh: "你好" });
    expect(d?.content.seo.title).toEqual({ en: "T", zh: "標題" });
  });

  it("keeps an existing zh and drops the old key", () => {
    const d = parsed(withProps({ en: "Hello", zh: "你好", "zh-TW": "妳好" }));
    expect(d?.content.sections.find((s) => s.type === "hero")?.props.title).toEqual({ en: "Hello", zh: "你好" });
  });

  it("the saved draft no longer contains any zh-TW key", () => {
    const d = parsed(withProps({ en: "Hello", "zh-TW": "你好" }));
    expect(JSON.stringify(d)).not.toContain("zh-TW");
  });

  it("the demo data contains no zh-TW key", () => {
    expect(JSON.stringify(sitePage)).not.toContain("zh-TW");
  });
});
