import type { SectionType } from "@workshop/shared";
import type { LayoutKey, PageContent, PageTheme, SectionInstance, ThemeDensity, ThemeRadius } from "@/lib/types";
import { normalizeOrder } from "./order";
import { createSection, defaultVariant, hasContent } from "./registry";
import { paletteTokens } from "./theme";

// The 10 platform templates (FR-SITE-01). A template = a page LAYOUT (frame: structure, navigation, chrome) + palette +
// font + corner radius + spacing + default section set/order/variants. All templates share the same 11 section types.
// TEMPLATE_KEYS is the order shown in the picker: the most beginner-friendly layouts come first.

export const TEMPLATE_KEYS = [
  "classic", "quicklinks", "bookingrail", "floatingcards", "sidebar", "journey", "magazine", "bento", "appstyle", "cinematic",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Keys used by earlier versions (v2 drafts): mapped to the closest new template so stored drafts keep working. */
export const LEGACY_TEMPLATE_KEYS: Record<string, TemplateKey> = {
  minimal: "quicklinks", bold: "cinematic", elegant: "magazine", rustic: "journey", modern: "sidebar",
  vibrant: "bento", serene: "floatingcards", artisan: "bookingrail", noir: "cinematic",
};

export interface TemplateSection { type: SectionType; variant: string; /** default true */ enabled?: boolean }
export interface TemplateDef { key: TemplateKey; layout: LayoutKey; sections: TemplateSection[]; theme: PageTheme }

const s = (type: SectionType, variant: string, enabled = true): TemplateSection => ({ type, variant, enabled });
const theme = (palette: string, font: string, radius: ThemeRadius, density: ThemeDensity): PageTheme => ({
  ...paletteTokens(palette), font, radius, density,
});

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  // Sticky top bar with anchor links + familiar stacked sections.
  classic: {
    key: "classic", layout: "classic", theme: theme("warm", "Inter", "md", "comfortable"),
    sections: [
      s("hero", "centered"), s("about", "image-left"), s("workshops", "grid"), s("gallery", "grid"), s("team", "cards"),
      s("testimonials", "cards"), s("video", "wide", false), s("faq", "accordion"), s("location", "simple"), s("contact", "list"),
      s("footer", "dark"),
    ],
  },
  // One narrow centred column of big buttons and cards (links-in-bio style).
  quicklinks: {
    key: "quicklinks", layout: "quicklinks", theme: theme("magenta", "Poppins", "xl", "compact"),
    sections: [
      s("hero", "compact"), s("workshops", "compact"), s("location", "card"), s("contact", "cards"), s("video", "wide"),
      s("about", "stacked"), s("gallery", "grid"), s("faq", "accordion"), s("testimonials", "quote", false),
      s("team", "inline", false), s("footer", "centered"),
    ],
  },
  // Content on the left, a sticky booking card on the right (bottom bar on phones).
  bookingrail: {
    key: "bookingrail", layout: "bookingrail", theme: theme("forest", "Noto Sans", "lg", "comfortable"),
    sections: [
      s("hero", "split"), s("about", "image-left"), s("workshops", "list"), s("gallery", "grid"), s("video", "wide"),
      s("team", "inline"), s("testimonials", "cards"), s("faq", "accordion"), s("location", "simple"), s("contact", "list"),
      s("footer", "dark"),
    ],
  },
  // Floating header pill, every section is its own rounded card on a tinted canvas.
  floatingcards: {
    key: "floatingcards", layout: "floatingcards", theme: theme("plum", "Poppins", "xl", "comfortable"),
    sections: [
      s("hero", "centered"), s("about", "image-left"), s("workshops", "grid"), s("gallery", "masonry"), s("video", "split"),
      s("team", "cards"), s("testimonials", "cards"), s("faq", "accordion"), s("location", "card"), s("contact", "cards"),
      s("footer", "centered"),
    ],
  },
  // Fixed side menu on desktop, top bar with a menu button on phones.
  sidebar: {
    key: "sidebar", layout: "sidebar", theme: theme("ocean", "Inter", "md", "comfortable"),
    sections: [
      s("hero", "overlay-left"), s("about", "image-right"), s("workshops", "grid"), s("gallery", "masonry"), s("video", "wide"),
      s("team", "inline"), s("testimonials", "cards"), s("faq", "two-column"), s("location", "simple"), s("contact", "cards"),
      s("footer", "light"),
    ],
  },
  // A vertical timeline: Discover, Choose, Visit, Book.
  journey: {
    key: "journey", layout: "journey", theme: theme("sage", "Noto Sans", "lg", "comfortable"),
    sections: [
      s("hero", "centered"), s("about", "stacked"), s("team", "inline"), s("gallery", "strip"), s("video", "wide"),
      s("workshops", "list"), s("testimonials", "cards"), s("location", "card"), s("faq", "accordion"), s("contact", "cards"),
      s("footer", "light"),
    ],
  },
  // Editorial: oversized serif headings, numbered chapters, pull quotes.
  magazine: {
    key: "magazine", layout: "magazine", theme: theme("mono", "Lora", "none", "spacious"),
    sections: [
      s("hero", "editorial"), s("about", "image-right"), s("workshops", "list"), s("gallery", "strip"), s("team", "inline"),
      s("testimonials", "quote"), s("video", "wide"), s("faq", "two-column"), s("location", "simple"), s("contact", "list"),
      s("footer", "centered"),
    ],
  },
  // Bento grid of mixed-size tiles.
  bento: {
    key: "bento", layout: "bento", theme: theme("indigo", "Inter", "lg", "compact"),
    sections: [
      s("hero", "overlay-left"), s("about", "image-left"), s("workshops", "grid"), s("gallery", "grid"), s("video", "wide"),
      s("team", "inline"), s("testimonials", "cards"), s("location", "card"), s("contact", "cards"), s("faq", "accordion"),
      s("footer", "light"),
    ],
  },
  // Tab bar: one group of sections at a time, like a mobile app.
  appstyle: {
    key: "appstyle", layout: "appstyle", theme: theme("sunset", "Inter", "xl", "compact"),
    sections: [
      s("hero", "centered"), s("about", "image-left"), s("team", "cards"), s("testimonials", "cards"), s("workshops", "grid"),
      s("gallery", "masonry"), s("video", "wide"), s("faq", "accordion"), s("location", "card"), s("contact", "cards"),
      s("footer", "dark"),
    ],
  },
  // Dark, full-height panels with big type and a dot progress indicator.
  cinematic: {
    key: "cinematic", layout: "cinematic", theme: theme("noir", "Poppins", "md", "spacious"),
    sections: [
      s("hero", "fullscreen"), s("about", "image-left"), s("workshops", "featured"), s("gallery", "strip"), s("video", "wide"),
      s("testimonials", "quote"), s("team", "inline", false), s("faq", "two-column"), s("location", "card"), s("contact", "cards"),
      s("footer", "centered"),
    ],
  },
};

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && (TEMPLATE_KEYS as readonly string[]).includes(v);
}

/** Current template key for any stored value: valid keys pass, legacy keys are mapped, anything else is undefined. */
export function resolveTemplateKey(v: unknown): TemplateKey | undefined {
  if (isTemplateKey(v)) return v;
  return typeof v === "string" && Object.hasOwn(LEGACY_TEMPLATE_KEYS, v) ? LEGACY_TEMPLATE_KEYS[v] : undefined;
}

/** Theme of a template; the shop's own logo and favicon survive a template switch. */
export function themeForTemplate(key: TemplateKey, keep?: Pick<PageTheme, "logoUrl" | "faviconUrl">): PageTheme {
  return { ...TEMPLATES[key].theme, ...(keep?.logoUrl ? { logoUrl: keep.logoUrl } : {}), ...(keep?.faviconUrl ? { faviconUrl: keep.faviconUrl } : {}) };
}

/** Fresh sections of a template (used for new shops / tests). */
export function templateSections(key: TemplateKey): SectionInstance[] {
  return TEMPLATES[key].sections.map((ts) => ({ ...createSection(ts.type, ts.variant), enabled: ts.enabled ?? true }));
}

export interface TemplateSwitchPlan {
  /** Page layout (frame) of the template. */
  layout: LayoutKey;
  sections: SectionInstance[];
  /** Sections the template adds with default content. */
  added: SectionType[];
  /** Sections the template does not list but that have content: kept, disabled. */
  hidden: SectionType[];
  /** Sections the template does not list and that are still untouched defaults: dropped. */
  removed: SectionType[];
}

/**
 * Switch template without losing content (FR-SITE-01):
 * - the page layout (frame) follows the template
 * - each listed section keeps its id, `props` and per-section `style`; its variant and enabled flag follow the template
 * - listed sections that do not exist yet are created with defaults
 * - unlisted sections with content stay in the page as disabled sections (before the footer); untouched ones are dropped
 */
export function planTemplateSwitch(content: PageContent, key: TemplateKey): TemplateSwitchPlan {
  const used = new Set<string>();
  const added: SectionType[] = [];
  const listed: SectionInstance[] = TEMPLATES[key].sections.map((ts) => {
    const existing = content.sections.find((x) => x.type === ts.type && !used.has(x.id));
    if (existing) {
      used.add(existing.id);
      return { ...existing, variant: ts.variant, enabled: ts.type === "footer" ? true : (ts.enabled ?? true) };
    }
    added.push(ts.type);
    return { ...createSection(ts.type, ts.variant), enabled: ts.enabled ?? true };
  });

  const hidden: SectionType[] = [];
  const removed: SectionType[] = [];
  const kept: SectionInstance[] = [];
  for (const x of content.sections) {
    if (used.has(x.id)) continue;
    if (hasContent(x)) {
      hidden.push(x.type);
      kept.push({ ...x, variant: defaultVariant(x.type), enabled: false });
    } else {
      removed.push(x.type);
    }
  }
  // Keep the footer last.
  const footerIdx = listed.findIndex((x) => x.type === "footer");
  const sections = footerIdx < 0 ? [...listed, ...kept] : [...listed.slice(0, footerIdx), ...kept, ...listed.slice(footerIdx)];
  // The hero is always first and the footer always last, whatever the template or the page had.
  return { layout: TEMPLATES[key].layout, sections: normalizeOrder(sections), added, hidden, removed };
}

export function applyTemplate(content: PageContent, key: TemplateKey): PageContent {
  const plan = planTemplateSwitch(content, key);
  return { ...content, layout: plan.layout, sections: plan.sections };
}
