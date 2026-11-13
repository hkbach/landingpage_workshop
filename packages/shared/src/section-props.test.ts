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

  it("checks the props of a type: a field may be missing, an unknown or badly shaped one is refused", () => {
    expect(checkSectionProps("hero", {}).success).toBe(true);
    expect(checkSectionProps("hero", { title: { en: "Hi" } }).success).toBe(true);
    expect(checkSectionProps("hero", { title: "Hi" }).success).toBe(false);
    expect(checkSectionProps("hero", { nope: 1 }).success).toBe(false);
    expect(checkSectionProps("contact", { email: "bad" }).success).toBe(false);
    expect(checkSectionProps("video", { videoId: "dQw4w9WgXcQ" })).toMatchObject({ success: true, data: { videos: ["dQw4w9WgXcQ"] } });
  });
});
