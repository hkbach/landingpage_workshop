import { checkNewPage, replacedByPublish, type NewPageCheck } from "@workshop/shared";
import { applyTemplate, resolveTemplateKey, TEMPLATE_KEYS, themeForTemplate, type TemplateKey } from "@/components/sections/templates";
import type { PageContent, PageTheme } from "@/lib/types";
import { newUuid } from "@/lib/uuid";
import { draftKeyFor, MAIN_PAGE_ID, publishedKeyFor, type Draft } from "./draft-store";

/** One landing page of a shop (frontend-only stand-in for the site_pages rows; the content lives under draftKeyFor / publishedKeyFor). */
export interface PageMeta { id: string; name: string; template: TemplateKey; createdAt: string; updatedAt: string }

export const PAGES_KEY = "builder:pages:v1";
/** Which page is public (frontend-only stand-in for the shop's live page). At most one. */
export const LIVE_KEY = "builder:live:v1";

/** Template a new page starts with. The shop owner can switch it in the editor. */
export const DEFAULT_TEMPLATE: TemplateKey = TEMPLATE_KEYS[0];

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
      const id = str(r.id), name = str(r.name).trim();
      if (!/^[a-z0-9-]{1,40}$/.test(id) || seen.has(id) || !name) continue;
      seen.add(id);
      pages.push({
        id, name, template: resolveTemplateKey(r.template) ?? "classic",
        createdAt: str(r.createdAt) || new Date(0).toISOString(), updatedAt: str(r.updatedAt) || new Date(0).toISOString(),
      });
    }
    return pages.length ? pages : null;
  } catch {
    return null;
  }
}

/** The shop always has its main page; it is created on first use. */
export function loadPages(main: { name: string; template: TemplateKey }, now = new Date().toISOString()): PageMeta[] {
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

/** Pure: the list with one more page (only a name is needed), or why it may not be added (limit, name). */
export function addPage(pages: readonly PageMeta[], input: { name: string }, ctx: { id: string; now: string }): AddPageResult {
  const reason = checkNewPage({ name: input.name, pageCount: pages.length });
  if (reason !== "OK") return { ok: false, reason };
  const page: PageMeta = { id: ctx.id, name: input.name.trim(), template: DEFAULT_TEMPLATE, createdAt: ctx.now, updatedAt: ctx.now };
  return { ok: true, pages: [...pages, page], page };
}

export type RemovePageResult = { ok: true; pages: PageMeta[] } | { ok: false; reason: "main" | "unknown" };

/** The main page (the first one, created with the shop) cannot be removed. */
export function removePage(pages: readonly PageMeta[], id: string): RemovePageResult {
  if (id === MAIN_PAGE_ID) return { ok: false, reason: "main" };
  if (!pages.some((p) => p.id === id)) return { ok: false, reason: "unknown" };
  return { ok: true, pages: pages.filter((p) => p.id !== id) };
}

/** Removes the saved draft and published version of a page; a deleted public page is no longer public. */
export function clearPageContent(id: string) {
  try {
    window.localStorage.removeItem(draftKeyFor(id));
    window.localStorage.removeItem(publishedKeyFor(id));
    if (window.localStorage.getItem(LIVE_KEY) === id) window.localStorage.removeItem(LIVE_KEY);
  } catch { /* nothing to clean in blocked storage */ }
}

/**
 * The public page. A shop that is already live starts with its main page public even before anything was published from
 * this browser (`mainLive`); once a page is published here, that one is the public page.
 */
export function loadLivePageId(mainLive: boolean): string | null {
  try {
    const stored = window.localStorage.getItem(LIVE_KEY);
    if (stored) return stored;
  } catch { /* blocked storage */ }
  return mainLive ? MAIN_PAGE_ID : null;
}

/** Makes `pageId` the one public page. Returns the ids of the pages that stopped being public. */
export function setLivePage(pageId: string, mainLive: boolean): { ok: boolean; replaced: string[] } {
  const current = loadLivePageId(mainLive);
  const replaced = replacedByPublish(current ? [current] : [], pageId);
  try { window.localStorage.setItem(LIVE_KEY, pageId); return { ok: true, replaced }; } catch { return { ok: false, replaced: [] }; }
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
