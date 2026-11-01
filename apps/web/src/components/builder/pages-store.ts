import { checkNewPage, normalizeSlug, type NewPageCheck } from "@workshop/shared";
import { applyTemplate, resolveTemplateKey, themeForTemplate, type TemplateKey } from "@/components/sections/templates";
import type { PageContent, PageTheme } from "@/lib/types";
import { newUuid } from "@/lib/uuid";
import { draftKeyFor, MAIN_PAGE_ID, publishedKeyFor, type Draft } from "./draft-store";

/** One landing page of a shop (frontend-only stand-in for the site_pages rows; the content lives under draftKeyFor / publishedKeyFor). */
export interface PageMeta { id: string; name: string; slug: string; template: TemplateKey; createdAt: string; updatedAt: string }

export const PAGES_KEY = "builder:pages:v1";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Rebuilds the list from untrusted stored JSON: broken rows are dropped, ids are unique. Null when nothing usable is left. */
export function parsePages(raw: string | null): PageMeta[] | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const seen = new Set<string>();
    const pages: PageMeta[] = [];
    for (const r of data) {
      if (!isObj(r)) continue;
      const id = str(r.id), name = str(r.name).trim(), slug = str(r.slug);
      if (!/^[a-z0-9-]{1,40}$/.test(id) || seen.has(id) || !name || !slug) continue;
      seen.add(id);
      pages.push({
        id, name, slug, template: resolveTemplateKey(r.template) ?? "classic",
        createdAt: str(r.createdAt) || new Date(0).toISOString(), updatedAt: str(r.updatedAt) || new Date(0).toISOString(),
      });
    }
    return pages.length ? pages : null;
  } catch {
    return null;
  }
}

/** The shop always has its main page; it is created on first use with the shop's own address. */
export function loadPages(main: { name: string; slug: string; template: TemplateKey }, now = new Date().toISOString()): PageMeta[] {
  let stored: PageMeta[] | null = null;
  try { stored = parsePages(window.localStorage.getItem(PAGES_KEY)); } catch { /* blocked storage: fall back to the main page */ }
  const base = stored ?? [];
  if (base.some((p) => p.id === MAIN_PAGE_ID)) return base;
  return [{ id: MAIN_PAGE_ID, ...main, createdAt: now, updatedAt: now }, ...base];
}

export function savePages(pages: PageMeta[]): boolean {
  try { window.localStorage.setItem(PAGES_KEY, JSON.stringify(pages)); return true; } catch { return false; }
}

export type AddPageResult = { ok: true; pages: PageMeta[]; page: PageMeta } | { ok: false; reason: Exclude<NewPageCheck, "OK"> };

/** Pure: the list with one more page, or why it may not be added (limit, name, address). */
export function addPage(
  pages: readonly PageMeta[],
  input: { name: string; slug: string; template: TemplateKey },
  ctx: { takenSlugs: readonly string[]; id: string; now: string },
): AddPageResult {
  const reason = checkNewPage({
    name: input.name, slug: input.slug, pageCount: pages.length,
    takenSlugs: [...ctx.takenSlugs, ...pages.map((p) => p.slug)],
  });
  if (reason !== "OK") return { ok: false, reason };
  const page: PageMeta = { id: ctx.id, name: input.name.trim(), slug: normalizeSlug(input.slug), template: input.template, createdAt: ctx.now, updatedAt: ctx.now };
  return { ok: true, pages: [...pages, page], page };
}

export type RemovePageResult = { ok: true; pages: PageMeta[] } | { ok: false; reason: "main" | "unknown" };

/** The main page (the shop's own address) cannot be removed. */
export function removePage(pages: readonly PageMeta[], id: string): RemovePageResult {
  if (id === MAIN_PAGE_ID) return { ok: false, reason: "main" };
  if (!pages.some((p) => p.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, pages: pages.filter((p) => p.id !== id) };
}

/** Removes the saved draft and published version of a page. */
export function clearPageContent(id: string) {
  try {
    window.localStorage.removeItem(draftKeyFor(id));
    window.localStorage.removeItem(publishedKeyFor(id));
  } catch { /* nothing to clean in blocked storage */ }
}

export function isPagePublished(id: string): boolean {
  try { return window.localStorage.getItem(publishedKeyFor(id)) !== null; } catch { return false; }
}

/** Record that the page was edited (and with which template). Keeps the list order. */
export function touchPage(pages: readonly PageMeta[], id: string, patch: { template?: TemplateKey; now: string }): PageMeta[] {
  return pages.map((p) => (p.id === id ? { ...p, ...(patch.template ? { template: patch.template } : {}), updatedAt: patch.now } : p));
}

/** What a page that was never edited shows: the sample content laid out with the page's template. */
export function starterFor(sample: { content: PageContent; theme: PageTheme }, template: TemplateKey): Draft {
  return { content: applyTemplate(sample.content, template), theme: themeForTemplate(template, sample.theme), template };
}

export function newPageId(): string {
  return `p-${newUuid().slice(0, 8)}`;
}
