import { describe, expect, it } from "vitest";
import {
  isAllowedMapsUrl, isDataImageUrl, isHttpsUrl, isImageUrl, MAX_DATA_IMAGE_LENGTH, safeImage, safeLink, safeMaps,
} from "./safe-url";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("https-only links", () => {
  it("accepts https", () => {
    expect(isHttpsUrl("https://example.com/a.jpg")).toBe(true);
    expect(safeLink("https://example.com")).toBe("https://example.com");
  });
  it.each(["http://example.com", "javascript:alert(1)", "data:text/html,x", "ftp://x.com", "//example.com", "example.com", "", "not a url"])(
    "rejects %j", (v) => {
      expect(isHttpsUrl(v)).toBe(false);
      expect(safeLink(v)).toBeUndefined();
    },
  );
  it("rejects non-strings", () => {
    expect(safeLink(undefined)).toBeUndefined();
    expect(safeImage(42)).toBeUndefined();
  });
});

describe("maps allowlist", () => {
  it.each([
    "https://maps.app.goo.gl/abc123",
    "https://www.google.com/maps/place/Foo",
    "https://google.com/maps?q=foo",
    "https://google.com/maps",
  ])("accepts %s", (v) => expect(isAllowedMapsUrl(v)).toBe(true));
  it.each([
    "http://maps.app.goo.gl/abc",
    "https://maps.google.com/maps",
    "https://google.com/search?q=maps",
    "https://google.com/mapsevil",
    "https://google.com.evil.com/maps",
    "https://evil.com/maps",
    "https://goo.gl/maps/abc",
    "javascript:alert(1)",
  ])("rejects %s", (v) => {
    expect(isAllowedMapsUrl(v)).toBe(false);
    expect(safeMaps(v)).toBeUndefined();
  });
});

describe("image urls: data: only in the builder/preview context", () => {
  it("public context (default) accepts https only", () => {
    expect(safeImage("https://example.com/a.webp")).toBe("https://example.com/a.webp");
    expect(safeImage(PNG)).toBeUndefined();
    expect(safeImage(PNG, {})).toBeUndefined();
    expect(safeImage(PNG, { allowDataImages: false })).toBeUndefined();
    expect(isImageUrl(PNG)).toBe(false);
  });
  it("builder context accepts data:image jpeg/png/webp base64", () => {
    const opts = { allowDataImages: true };
    expect(safeImage(PNG, opts)).toBe(PNG);
    expect(safeImage("data:image/jpeg;base64,/9j/4AAQ", opts)).toBeDefined();
    expect(safeImage("data:image/webp;base64,UklGRg==", opts)).toBeDefined();
    expect(safeImage("https://example.com/a.png", opts)).toBeDefined();
  });
  it.each([
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/gif;base64,R0lGODlh",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/png,rawtext",
    "data:image/png;base64,abc def",
    "data:image/png;base64,<script>",
    "data:image/png;base64,",
    "javascript:alert(1)",
    "http://example.com/a.png",
  ])("builder context still rejects %s", (v) => {
    expect(safeImage(v, { allowDataImages: true })).toBeUndefined();
  });
  it("caps the data url length", () => {
    const big = `data:image/png;base64,${"A".repeat(MAX_DATA_IMAGE_LENGTH)}`;
    expect(isDataImageUrl(big)).toBe(false);
  });
});
