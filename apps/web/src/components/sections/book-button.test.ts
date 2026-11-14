import { createElement, type ComponentType, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { SECTION_TYPES, type SectionType } from "@workshop/shared";
import { currentShop, sitePage, workshops } from "@/lib/sample/data";
import { parseDraft } from "@/components/builder/draft-store";
import type { SectionInstance } from "@/lib/types";
import type { RenderContext } from "./context";
import { sectionInstanceSchema } from "./instance";
import { BOOK_BUTTON_DEFAULT, createSection, isBookButtonShown, supportsBookButton } from "./registry";
import { SectionRenderer } from "./SectionRenderer";
import { applyTemplate } from "./templates";

const messages = {
  site: { sections: { bookCta: "BOOKCTA", book: "BOOKCARD", bookWorkshop: "BOOKWS {title}", duration: "{minutes} min", perPerson: "pp", noWorkshops: "none" } },
};
const ctx: RenderContext = {
  locale: "en",
  shop: { name: currentShop.name, defaultLocale: "en", enabledLocales: ["en"], timezone: currentShop.timezone, currency: currentShop.currency },
  workshops: workshops.filter((w) => w.status === "ACTIVE"),
  reportHref: "#", privacyHref: "#",
};

// The provider's own typings require extra props for the server-only API; the client provider is enough here.
const IntlProvider = NextIntlClientProvider as unknown as ComponentType<{ locale: string; messages: typeof messages; children?: ReactNode }>;

function render(section: SectionInstance): string {
  const el: ReactElement = createElement(
    IntlProvider, { locale: "en", messages },
    createElement(SectionRenderer, { section, ctx, theme: sitePage.theme }),
  );
  return renderToStaticMarkup(el);
}
const make = (type: SectionType, patch: Partial<SectionInstance> = {}): SectionInstance => ({ ...createSection(type), ...patch });
/** A section with real content (the demo shop has every type); fresh defaults of some types are empty and render nothing. */
const filled = (type: SectionType, patch: Partial<SectionInstance> = {}): SectionInstance => {
  const base = sitePage.draft.sections.find((s) => s.type === type);
  if (!base) throw new Error(`demo draft has no ${type} section`);
  const copy: SectionInstance = { ...base };
  delete copy.showBook;
  return { ...copy, ...patch };
};

describe("Book button rules", () => {
  it("defaults: hero and workshops on, everything else off, footer unsupported", () => {
    for (const type of SECTION_TYPES) {
      expect(isBookButtonShown({ type, showBook: undefined })).toBe(type === "footer" ? false : BOOK_BUTTON_DEFAULT[type]);
    }
    expect(BOOK_BUTTON_DEFAULT.hero).toBe(true);
    expect(BOOK_BUTTON_DEFAULT.workshops).toBe(true);
    expect(supportsBookButton("footer")).toBe(false);
    for (const type of SECTION_TYPES.filter((t) => t !== "footer")) expect(supportsBookButton(type)).toBe(true);
  });

  it("an explicit choice wins over the default, except on the footer", () => {
    expect(isBookButtonShown({ type: "about", showBook: true })).toBe(true);
    expect(isBookButtonShown({ type: "hero", showBook: false })).toBe(false);
    expect(isBookButtonShown({ type: "footer", showBook: true })).toBe(false);
  });

  it("the stored section schema accepts a boolean showBook and rejects other types", () => {
    const ok = { id: "x", type: "faq", enabled: true, props: createSection("faq").props, showBook: true };
    expect(sectionInstanceSchema.safeParse(ok).success).toBe(true);
    expect(sectionInstanceSchema.safeParse({ ...ok, showBook: "yes" }).success).toBe(false);
  });

  it("survives a draft round trip (reload) and a template switch", () => {
    const content = {
      ...sitePage.draft,
      sections: sitePage.draft.sections.map((s) => (s.type === "about" ? { ...s, showBook: true } : s.type === "hero" ? { ...s, showBook: false } : s)),
    };
    const reloaded = parseDraft(JSON.stringify({ content, theme: sitePage.theme, template: sitePage.template }));
    expect(reloaded?.content.sections.find((s) => s.type === "about")?.showBook).toBe(true);
    expect(reloaded?.content.sections.find((s) => s.type === "hero")?.showBook).toBe(false);
    expect(reloaded?.content.sections.find((s) => s.type === "location")?.showBook).toBeUndefined();

    const switched = applyTemplate(content, "magazine");
    expect(switched.sections.find((s) => s.type === "about")?.showBook).toBe(true);
    expect(switched.sections.find((s) => s.type === "hero")?.showBook).toBe(false);
  });

  it("ignores a non-boolean showBook in a stored draft", () => {
    const content = { ...sitePage.draft, sections: sitePage.draft.sections.map((s) => (s.type === "about" ? { ...s, showBook: "yes" } : s)) };
    const d = parseDraft(JSON.stringify({ content, theme: sitePage.theme, template: sitePage.template }));
    expect(d?.content.sections.find((s) => s.type === "about")?.showBook).toBeUndefined();
  });
});

describe("Book button rendering", () => {
  const generic: SectionType[] = ["about", "gallery", "team", "testimonials", "faq", "location", "contact", "video"];

  it.each(generic)("%s: no Book button by default, one when switched on", (type) => {
    expect(render(filled(type))).not.toContain("BOOKCTA");
    const html = render(filled(type, { showBook: true }));
    expect(html.match(/BOOKCTA/g)?.length).toBe(1);
    expect(html).toContain("<button");
  });

  it("an empty section renders nothing, so it has no Book button either", () => {
    const html = render(make("gallery", { showBook: true }));
    expect(html).not.toContain("BOOKCTA");
    expect(html).not.toContain("<button");
  });

  it("the footer never renders a Book button", () => {
    expect(render(make("footer", { showBook: true }))).not.toContain("BOOKCTA");
  });

  it("hero: call-to-action shown by default and hidden when switched off", () => {
    const hero = make("hero", { props: { title: { en: "T" }, subtitle: { en: "S" }, imageUrl: "", ctaText: { en: "CTATEXT" } } });
    expect(render(hero)).toContain("CTATEXT");
    expect(render({ ...hero, showBook: false })).not.toContain("CTATEXT");
  });

  it("workshops: Book buttons on each card by default, none when switched off (cards stay)", () => {
    const section = make("workshops");
    expect(render(section)).toContain("BOOKCARD");
    const off = render({ ...section, showBook: false });
    expect(off).not.toContain("BOOKCARD");
    expect(off).toContain(ctx.workshops[0]!.title.en!);
  });

  it("workshops compact: rows are buttons by default and plain information when switched off", () => {
    const section = make("workshops", { variant: "compact" });
    expect(render(section)).toContain("<button");
    const off = render({ ...section, showBook: false });
    expect(off).not.toContain("<button");
    expect(off).toContain(ctx.workshops[0]!.title.en!);
  });
});
