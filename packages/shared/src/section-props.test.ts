import { describe, expect, it } from "vitest";
import { SECTION_TYPES } from "./enums";
import { LAYOUT_KEYS, SECTION_VARIANTS, checkSectionProps, isAllowedMapsUrl, isHttpsUrl, isImageUrl } from "./section-props";

describe("section props", () => {
  it("has variants for every section type and a first layout of classic", () => {
    for (const t of SECTION_TYPES) expect(SECTION_VARIANTS[t].length).toBeGreaterThan(0);
    expect(LAYOUT_KEYS[0]).toBe("classic");
  });

  it("accepts https links, platform images and (only for the editor) data images", () => {
    expect(isHttpsUrl("https://a.example/x")).toBe(true);
    expect(isHttpsUrl("http://a.example/x")).toBe(false);
    expect(isHttpsUrl("javascript:alert(1)")).toBe(false);
    expect(isImageUrl("/api/v1/media/workshop/abcdef12-3456")).toBe(true);
    expect(isImageUrl("data:image/png;base64,AAAA")).toBe(false);
    expect(isImageUrl("data:image/png;base64,AAAA", { allowDataImages: true })).toBe(true);
    expect(isAllowedMapsUrl("https://maps.app.goo.gl/x")).toBe(true);
    expect(isAllowedMapsUrl("https://evil.example/maps")).toBe(false);
  });

  const hero = { title: { en: "Hi" }, subtitle: {}, imageUrl: "", ctaText: {} };
  it("checks the props of a type: every field must be there, an unknown or badly shaped one is refused", () => {
    expect(checkSectionProps("hero", hero).success).toBe(true);
    expect(checkSectionProps("hero", { ...hero, title: "Hi" }).success).toBe(false);
    expect(checkSectionProps("hero", { ...hero, nope: 1 }).success).toBe(false);
    expect(checkSectionProps("contact", { heading: {}, phone: "", whatsapp: "", email: "bad", socials: [] }).success).toBe(false);
    expect(checkSectionProps("video", { heading: {}, caption: {}, videoId: "dQw4w9WgXcQ" })).toMatchObject({ success: true, data: { videos: ["dQw4w9WgXcQ"] } });
  });

  it("refuses a section that lacks a field (the same rule as the editor), and says which one", () => {
    for (const type of ["hero", "about", "gallery", "contact", "footer"] as const) {
      const res = checkSectionProps(type, {});
      expect(res.success, type).toBe(false);
    }
    const { imageUrl: _omitted, ...withoutImage } = hero;
    void _omitted;
    const res = checkSectionProps("hero", withoutImage);
    expect(res.success).toBe(false);
    expect(!res.success && res.error.issues.map((i) => i.path.join("."))).toEqual(["imageUrl"]);
  });

  it("does not cut a list of videos down: more than five is refused, as is a bad id", () => {
    const videos = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd", "eeeeeeeeeee"];
    expect(checkSectionProps("video", { heading: {}, caption: {}, videos }).success).toBe(true);
    expect(checkSectionProps("video", { heading: {}, caption: {}, videos: [...videos, "fffffffffff"] }).success).toBe(false);
    expect(checkSectionProps("video", { heading: {}, caption: {}, videos: ["dQw4w9WgXcQ", "not-valid"] }).success).toBe(false);
  });

  it("takes an uploaded data: image only where asked (the editor), never by default (the API)", () => {
    const data = `data:image/png;base64,${"A".repeat(40)}`;
    expect(checkSectionProps("hero", { ...hero, imageUrl: data }).success).toBe(false);
    expect(checkSectionProps("hero", { ...hero, imageUrl: data }, { allowDataImages: true }).success).toBe(true);
  });
});
