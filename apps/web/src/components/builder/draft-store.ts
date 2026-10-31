import { SECTION_TYPES, type SectionType } from "@workshop/shared";
import type { PageContent, PageTheme, SectionInstance, ThemeDensity, ThemeRadius } from "@/lib/types";
import { normalizeOrder } from "@/components/sections/order";
import { createSection, isValidVariant, migrateSectionProps } from "@/components/sections/registry";
import { isImageUrl } from "@/components/sections/safe-url";
import { isLayoutKey } from "@/components/sections/layouts";
import { resolveTemplateKey, TEMPLATES, type TemplateKey } from "@/components/sections/templates";
import { FONTS, resolveThemeColors, sanitizeSectionStyle } from "@/components/sections/theme";

// Frontend-only "autosave": the draft lives in localStorage until the API exists (PUT draft_content).
export interface Draft { content: PageContent; theme: PageTheme; template: TemplateKey }

// v3: page content gained `layout` (the page frame) and the templates were redesigned. v2 drafts are migrated on load
// (stale template keys are mapped, the layout follows the template) and removed after the first v3 save; v1 is dropped.
export const DRAFT_KEY = "builder:draft:v3";
const MIGRATE_KEY = "builder:draft:v2";
const LEGACY_KEYS = ["builder:draft:v1"];

const RADII: readonly ThemeRadius[] = ["none", "sm", "md", "lg", "xl"];
const DENSITIES: readonly ThemeDensity[] = ["compact", "comfortable", "spacious"];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

function sanitizeTheme(raw: unknown, template: TemplateKey): PageTheme | null {
  if (!isObj(raw)) return null;
  const base = TEMPLATES[template].theme;
  const colors = resolveThemeColors({ palette: typeof raw.palette === "string" ? raw.palette : base.palette, ...raw } as Partial<PageTheme>);
  const img = (v: unknown) => (typeof v === "string" && v && isImageUrl(v, { allowDataImages: true }) ? v : undefined);
  const logoUrl = img(raw.logoUrl), faviconUrl = img(raw.faviconUrl);
  return {
    palette: typeof raw.palette === "string" ? raw.palette : "custom",
    ...colors,
    font: typeof raw.font === "string" && FONTS.some((f) => f.key === raw.font) ? raw.font : base.font,
    radius: RADII.find((r) => r === raw.radius) ?? base.radius,
    density: DENSITIES.find((d) => d === raw.density) ?? base.density,
    ...(logoUrl ? { logoUrl } : {}),
    ...(faviconUrl ? { faviconUrl } : {}),
  };
}

function sanitizeSection(raw: unknown): SectionInstance | null {
  if (!isObj(raw) || typeof raw.id !== "string" || !raw.id) return null;
  if (!(SECTION_TYPES as readonly string[]).includes(raw.type as string)) return null;
  if (typeof raw.enabled !== "boolean" || !isObj(raw.props)) return null;
  const type = raw.type as SectionType;
  const style = sanitizeSectionStyle(raw.style);
  return {
    id: raw.id, type, enabled: raw.enabled, props: migrateSectionProps(type, raw.props),
    ...(isValidVariant(type, raw.variant) ? { variant: raw.variant } : {}),
    ...(Object.keys(style).length ? { style } : {}),
    ...(typeof raw.showBook === "boolean" ? { showBook: raw.showBook } : {}),
  };
}

/** Rebuild a safe Draft from untrusted stored JSON; null when it cannot be recovered. */
export function sanitizeDraft(raw: unknown): Draft | null {
  if (!isObj(raw) || !isObj(raw.content) || raw.content.schemaVersion !== 1 || !Array.isArray(raw.content.sections)) return null;
  const template: TemplateKey = resolveTemplateKey(raw.template) ?? "classic";
  const theme = sanitizeTheme(raw.theme, template);
  if (!theme) return null;
  const sections = raw.content.sections.map(sanitizeSection).filter((s): s is SectionInstance => s !== null);
  if (sections.length === 0) return null;
  if (!sections.some((s) => s.type === "footer")) sections.push(createSection("footer", "dark"));
  const seo = isObj(raw.content.seo) ? raw.content.seo : {};
  // Layout: the stored one when valid, otherwise the layout of the (possibly migrated) template.
  const layout = isLayoutKey(raw.content.layout) ? raw.content.layout : TEMPLATES[template].layout;
  return {
    template, theme,
    content: {
      schemaVersion: 1, layout, sections: normalizeOrder(sections),
      seo: { title: isObj(seo.title) ? seo.title : {}, description: isObj(seo.description) ? seo.description : {} },
    } as PageContent,
  };
}

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    return sanitizeDraft(JSON.parse(raw));
  } catch {
    return null; // corrupt draft
  }
}

export function loadDraft(): Draft | null {
  try {
    for (const k of LEGACY_KEYS) window.localStorage.removeItem(k);
    return parseDraft(window.localStorage.getItem(DRAFT_KEY)) ?? parseDraft(window.localStorage.getItem(MIGRATE_KEY));
  } catch {
    return null;
  }
}

export type SaveResult = { ok: true } | { ok: false; reason: "quota" | "unavailable" };

/** Never throws: a full or blocked localStorage is reported to the UI instead of crashing it. */
export function saveDraft(draft: Draft): SaveResult {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    window.localStorage.removeItem(MIGRATE_KEY);
    return { ok: true };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return { ok: false, reason: quota ? "quota" : "unavailable" };
  }
}
