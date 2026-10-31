import { describe, expect, it } from "vitest";
import { sitePage } from "@/lib/mock/data";
import { DRAFT_KEY, parseDraft, sanitizeDraft } from "./draft-store";
import { sectionInstanceSchema, needsAttention } from "@/components/sections/instance";

const valid = () => ({ content: sitePage.draft, theme: sitePage.theme, template: sitePage.template });

describe("draft store", () => {
  it("uses a bumped storage key", () => {
    expect(DRAFT_KEY).toBe("builder:draft:v2");
  });

  it("round-trips the mock draft", () => {
    const d = parseDraft(JSON.stringify(valid()));
    expect(d?.template).toBe("artisan");
    expect(d?.content.sections.length).toBe(sitePage.draft.sections.length);
  });

  it("mock draft: all sections valid, includes a video section with an id, no contrast failures", () => {
    for (const s of sitePage.draft.sections) {
      expect(sectionInstanceSchema.safeParse(s).success, s.type).toBe(true);
      expect(needsAttention(s, sitePage.theme), s.type).toBe(false);
    }
    expect(sitePage.draft.sections.find((s) => s.type === "video")?.props.videoId).toBe("dQw4w9WgXcQ");
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
    expect(sanitizeDraft({ ...valid(), template: "nope" })?.template).toBe("classic");
  });
});
