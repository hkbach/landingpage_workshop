import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { currentShop, sitePage, workshops } from "@/lib/mock/data";
import type { SectionInstance } from "@/lib/types";
import type { RenderContext } from "./context";
import { createSection } from "./registry";
import { SectionRenderer } from "./SectionRenderer";

const messages = {
  site: { sections: { playVideo: "PLAY {title}", videoTitle: "Video", videoItem: "{title} #{n}/{total}", bookCta: "BOOKCTA" } },
};
const ctx: RenderContext = {
  locale: "en",
  shop: { name: currentShop.name, defaultLocale: "en", enabledLocales: ["en"], timezone: currentShop.timezone, currency: currentShop.currency },
  workshops: workshops.filter((w) => w.status === "ACTIVE"),
  reportHref: "#", privacyHref: "#",
};
const IntlProvider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; messages: typeof messages; children?: ReactNode }>;

const IDS = ["aaaaaaaaaaa", "bbbbbbbbbbb", "ccccccccccc", "ddddddddddd", "eeeeeeeeeee", "fffffffffff", "ggggggggggg"];

function render(videos: unknown, variant?: string): string {
  const section: SectionInstance = { ...createSection("video"), ...(variant ? { variant } : {}), props: { heading: { en: "Studio" }, caption: { en: "" }, videos } };
  const el: ReactElement = createElement(IntlProvider, { locale: "en", messages }, createElement(SectionRenderer, { section, ctx, theme: sitePage.theme }));
  return renderToStaticMarkup(el);
}
const plays = (html: string) => (html.match(/<button[^>]*>/g) ?? []).length;

describe("video section rendering", () => {
  it("one video: a single player with a plain title", () => {
    const html = render([IDS[0]]);
    expect(plays(html)).toBe(1);
    expect(html).toContain("PLAY Studio");
    expect(html).not.toContain("#1/1");
  });

  it.each([2, 3, 4, 5])("%i videos: one thumbnail and play button each, numbered for screen readers", (n) => {
    const html = render(IDS.slice(0, n));
    expect(plays(html)).toBe(n);
    expect(html).toContain(`#${n}/${n}`);
    for (const id of IDS.slice(0, n)) expect(html).toContain(`i.ytimg.com/vi/${id}/`);
  });

  it("never renders more than five, even if stored data has more", () => {
    const html = render(IDS);
    expect(plays(html)).toBe(5);
    expect(html).not.toContain(IDS[5]!);
    expect(html).not.toContain(IDS[6]!);
  });

  it("ignores empty slots and invalid values", () => {
    const html = render(["", IDS[0], "not-an-id", 42, null, IDS[1]]);
    expect(plays(html)).toBe(2);
    expect(html).toContain("#2/2");
  });

  it("renders nothing when there is no valid video", () => {
    for (const videos of [[], [""], ["bad"], undefined, "dQw4w9WgXcQ"]) {
      expect(plays(render(videos)), JSON.stringify(videos)).toBe(0);
    }
  });

  it("no iframe is mounted before Play is pressed (lazy facade), in both variants", () => {
    expect(render(IDS.slice(0, 5))).not.toContain("<iframe");
    expect(render(IDS.slice(0, 5), "split")).not.toContain("<iframe");
    expect(plays(render(IDS.slice(0, 3), "split"))).toBe(3);
  });
});
