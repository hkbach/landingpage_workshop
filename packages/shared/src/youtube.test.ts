import { describe, expect, it } from "vitest";
import { isYoutubeId, parseYoutubeId, youtubeEmbedUrl, youtubeThumbnailUrl } from "./youtube";

const ID = "dQw4w9WgXcQ";

describe("parseYoutubeId - accepted forms", () => {
  it.each([
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}`,
    `http://www.youtube.com/watch?v=${ID}`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/watch?feature=share&v=${ID}&t=42s`,
    `https://www.youtube.com/watch?v=${ID}&list=PL123&index=2`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123&t=10`,
    `https://youtu.be/${ID}/`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://m.youtube.com/shorts/${ID}?feature=share`,
    `https://www.youtube.com/embed/${ID}`,
    `https://youtube.com/embed/${ID}?start=5`,
    `  https://youtu.be/${ID}  `,
    `HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`,
  ])("%s", (url) => {
    expect(parseYoutubeId(url)).toBe(ID);
  });

  it("accepts ids with - and _", () => {
    expect(parseYoutubeId("https://youtu.be/a-b_c-d_e-f")).toBe("a-b_c-d_e-f");
  });
});

describe("parseYoutubeId - rejected", () => {
  it.each([
    ["empty", ""],
    ["not a url", "hello"],
    ["scheme-less", `www.youtube.com/watch?v=${ID}`],
    ["lookalike suffix", `https://youtube.com.evil.com/watch?v=${ID}`],
    ["lookalike prefix", `https://evilyoutube.com/watch?v=${ID}`],
    ["lookalike dash", `https://youtube-com.evil.com/watch?v=${ID}`],
    ["subdomain of other host", `https://www.youtube.com.attacker.io/embed/${ID}`],
    ["unknown subdomain", `https://evil.youtube.com/watch?v=${ID}`],
    ["userinfo host trick", `https://youtube.com@evil.com/watch?v=${ID}`],
    ["userinfo on real host", `https://user:pass@www.youtube.com/watch?v=${ID}`],
    ["trailing dot host", `https://www.youtube.com./watch?v=${ID}`],
    ["custom port", `https://www.youtube.com:8443/watch?v=${ID}`],
    ["youtu.be lookalike", `https://youtu.be.evil.com/${ID}`],
    ["javascript scheme", `javascript:alert(1)//youtube.com/watch?v=${ID}`],
    ["data scheme", "data:text/html,<script>alert(1)</script>"],
    ["ftp scheme", `ftp://youtube.com/watch?v=${ID}`],
    ["file scheme", `file:///youtube.com/watch?v=${ID}`],
    ["id too short", "https://youtu.be/abc"],
    ["id too long", `https://youtu.be/${ID}X`],
    ["id with bad chars", "https://youtu.be/dQw4w9WgX<>"],
    ["watch without v", "https://www.youtube.com/watch"],
    ["unsupported path", `https://www.youtube.com/playlist?list=${ID}`],
    ["watch with extra segment", `https://www.youtube.com/watch/${ID}`],
    ["shorts nested", `https://www.youtube.com/shorts/${ID}/extra`],
    ["youtu.be extra path", `https://youtu.be/${ID}/extra`],
    ["nocookie host", `https://www.youtube-nocookie.com/embed/${ID}`],
    ["id only in fragment", `https://www.youtube.com/watch#v=${ID}`],
    ["too long input", `https://youtu.be/${ID}?x=${"a".repeat(3000)}`],
  ])("%s", (_name, url) => {
    expect(parseYoutubeId(url)).toBeNull();
  });

  it("rejects non-string input", () => {
    expect(parseYoutubeId(undefined as unknown as string)).toBeNull();
    expect(parseYoutubeId(42 as unknown as string)).toBeNull();
  });
});

describe("youtube id/url helpers", () => {
  it("isYoutubeId", () => {
    expect(isYoutubeId(ID)).toBe(true);
    expect(isYoutubeId("short")).toBe(false);
    expect(isYoutubeId(`${ID}\n`)).toBe(false);
    expect(isYoutubeId(null)).toBe(false);
  });
  it("builds thumbnail and nocookie embed urls", () => {
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
    expect(youtubeEmbedUrl(ID)).toBe(`https://www.youtube-nocookie.com/embed/${ID}?autoplay=1&rel=0`);
  });
  it("throws for an invalid id instead of building a url", () => {
    expect(() => youtubeEmbedUrl("../evil")).toThrow();
    expect(() => youtubeThumbnailUrl("x")).toThrow();
  });
});
