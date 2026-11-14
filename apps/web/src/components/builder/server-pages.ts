import type { Locale } from "@workshop/shared";
import { createSection, SECTION_REGISTRY } from "@/components/sections/registry";
import { applyTemplate, resolveTemplateKey, TEMPLATES, type TemplateKey } from "@/components/sections/templates";
import type { PageContent, PageTheme } from "@/lib/types";
import type { Draft } from "./draft-store";
import type { PageMeta } from "./pages-store";

// The landing pages as the SERVER keeps them (connected to the API). The builder and the list then take their pages, drafts and live page from here instead of from the browser's storage.

/** A page as `GET /site/pages` gives it. */
export type ServerPage = {
  id: string; name: string; templateKey: string; isLive: boolean; version: number; hasDraft: boolean; hasUnpublishedChanges: boolean; publishedAt: string | null; updatedAt: string;
};

/** `GET /site/pages/{id}`: the page with what the builder opens: the saved draft, else the published content, else nothing yet. */
export type ServerPageDetail = ServerPage & { theme: Record<string, unknown>; content: PageContent | null; source: "DRAFT" | "PUBLISHED" | "NONE" };

export const pageMetaOf = (p: ServerPage): PageMeta => ({ id: p.id, name: p.name, template: resolveTemplateKey(p.templateKey) ?? "classic", createdAt: p.updatedAt, updatedAt: p.updatedAt });

/**
 * What a page that was never edited starts from: the sections every shop needs, laid out with the template of the page. The hero carries the name of the shop; nothing is made up about
 * the shop (the owner writes the rest).
 */
export function starterDraft(shop: { name: string; defaultLocale: Locale }, template: TemplateKey): Draft {
  const hero = createSection("hero");
  hero.props = { ...hero.props, title: { [shop.defaultLocale]: shop.name } };
  const content: PageContent = {
    schemaVersion: 1, sections: (["about", "workshops", "promotions", "contact", "footer"] as const).reduce((list, type) => [...list, createSection(type)], [hero]),
    seo: { title: { [shop.defaultLocale]: shop.name }, description: {} },
  };
  return { content: applyTemplate(content, template), theme: TEMPLATES[template].theme, template };
}

/**
 * A saved section with the fields it lacks filled in from the defaults of its type. The API keeps a page whose sections have only some of their fields (a page written by a script, or by an
 * older version of the builder); the builder needs every field, and without them it marks the section "needs attention" and blocks Publish for something the owner never did. What is saved
 * is never changed here: the owner's own values win over the defaults.
 */
export function withDefaults(content: PageContent): PageContent {
  return {
    ...content,
    sections: content.sections.map((s) => (SECTION_REGISTRY[s.type] ? { ...s, props: { ...SECTION_REGISTRY[s.type].defaultProps(), ...s.props } } : s)),
  };
}

/** The draft the builder opens a server page with. */
export function draftOf(page: ServerPageDetail, shop: { name: string; defaultLocale: Locale }): Draft {
  const template = resolveTemplateKey(page.templateKey) ?? "classic";
  if (!page.content) return starterDraft(shop, template);
  return { content: withDefaults(page.content), theme: { ...TEMPLATES[template].theme, ...page.theme } as PageTheme, template };
}

export type ServerPageList = {
  pages: PageMeta[]; liveId: string | null;
  /** What each page shows now (its draft, or the starter): the readiness of the Publish button is worked out from it. */
  drafts: Record<string, Draft>;
  /** The pages that have a draft on the server (the others get their starter saved when they are published from the list). */
  saved: string[];
};
