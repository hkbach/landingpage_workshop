import type { SectionType } from "@workshop/shared";
import type { PageContent, PageTheme, SectionInstance, ThemeDensity, ThemeRadius } from "@/lib/types";
import { createSection, defaultVariant, hasContent } from "./registry";
import { paletteTokens } from "./theme";

// The 10 platform templates (FR-SITE-01). A template = default section order + per-section layout variant + palette +
// font + corner radius + spacing. All templates share the same 11 section types and renderers.

export const TEMPLATE_KEYS = [
  "classic", "minimal", "bold", "elegant", "rustic", "modern", "vibrant", "serene", "artisan", "noir",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export interface TemplateSection { type: SectionType; variant: string; /** default true */ enabled?: boolean }
export interface TemplateDef { key: TemplateKey; sections: TemplateSection[]; theme: PageTheme }

const s = (type: SectionType, variant: string, enabled = true): TemplateSection => ({ type, variant, enabled });
const theme = (palette: string, font: string, radius: ThemeRadius, density: ThemeDensity): PageTheme => ({
  ...paletteTokens(palette), font, radius, density,
});

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  // Warm, familiar full story page.
  classic: {
    key: "classic", theme: theme("warm", "Inter", "md", "comfortable"),
    sections: [
      s("hero", "centered"), s("about", "image-left"), s("workshops", "grid"), s("gallery", "grid"), s("team", "cards"),
      s("testimonials", "cards"), s("faq", "accordion"), s("location", "simple"), s("contact", "list"), s("footer", "dark"),
    ],
  },
  // Short, monochrome, system font: hero, workshops, FAQ, location.
  minimal: {
    key: "minimal", theme: theme("mono", "System", "sm", "compact"),
    sections: [
      s("hero", "centered"), s("workshops", "list"), s("faq", "accordion"), s("location", "simple"),
      s("contact", "list", false), s("footer", "light"),
    ],
  },
  // Loud and sharp: square corners, red palette, big featured workshop and a video up front.
  bold: {
    key: "bold", theme: theme("sunset", "Poppins", "none", "comfortable"),
    sections: [
      s("hero", "overlay-left"), s("workshops", "featured"), s("video", "wide"), s("about", "image-right"),
      s("gallery", "masonry", false), s("team", "cards", false), s("testimonials", "cards"), s("faq", "two-column"),
      s("location", "card"), s("contact", "cards"), s("footer", "dark"),
    ],
  },
  // Refined serif look on plum with generous spacing and pull quotes.
  elegant: {
    key: "elegant", theme: theme("plum", "Lora", "sm", "spacious"),
    sections: [
      s("hero", "centered"), s("about", "stacked"), s("workshops", "list"), s("gallery", "strip"), s("team", "inline"),
      s("testimonials", "quote"), s("faq", "two-column"), s("video", "wide", false), s("location", "simple"),
      s("contact", "list"), s("footer", "centered"),
    ],
  },
  // Earthy forest green, serif body, masonry gallery and map card.
  rustic: {
    key: "rustic", theme: theme("forest", "Noto Serif", "md", "comfortable"),
    sections: [
      s("hero", "overlay-left"), s("about", "image-left"), s("workshops", "grid"), s("gallery", "masonry"), s("team", "cards"),
      s("testimonials", "cards"), s("video", "wide", false), s("faq", "accordion"), s("location", "card"),
      s("contact", "cards"), s("footer", "dark"),
    ],
  },
  // Clean blue, rounded corners, split hero and a side-by-side video.
  modern: {
    key: "modern", theme: theme("ocean", "Inter", "lg", "comfortable"),
    sections: [
      s("hero", "split"), s("about", "image-right"), s("workshops", "grid"), s("video", "split"), s("gallery", "grid"),
      s("team", "inline"), s("testimonials", "cards", false), s("faq", "two-column"), s("location", "simple"),
      s("contact", "cards"), s("footer", "light"),
    ],
  },
  // Playful magenta with pill buttons, featured workshop, video and masonry gallery.
  vibrant: {
    key: "vibrant", theme: theme("magenta", "Poppins", "xl", "comfortable"),
    sections: [
      s("hero", "centered"), s("workshops", "featured"), s("video", "wide"), s("about", "image-left"), s("gallery", "masonry"),
      s("testimonials", "cards"), s("faq", "accordion"), s("location", "card"), s("contact", "cards"), s("footer", "dark"),
    ],
  },
  // Calm sage tones, airy spacing, strip gallery and quotes.
  serene: {
    key: "serene", theme: theme("sage", "Noto Sans", "lg", "spacious"),
    sections: [
      s("hero", "centered"), s("about", "stacked"), s("workshops", "list"), s("gallery", "strip"), s("video", "wide"),
      s("testimonials", "quote"), s("faq", "accordion"), s("location", "card"), s("contact", "list"), s("footer", "light"),
    ],
  },
  // Craft-focused: indigo on cream, serif, makers (team) come right after the story.
  artisan: {
    key: "artisan", theme: theme("indigo", "Lora", "sm", "comfortable"),
    sections: [
      s("hero", "split"), s("about", "image-right"), s("team", "cards"), s("workshops", "grid"), s("gallery", "masonry"),
      s("video", "split"), s("testimonials", "cards"), s("faq", "accordion"), s("location", "card"), s("contact", "list"),
      s("footer", "dark"),
    ],
  },
  // Dark mode with gold accent, featured workshop, video and pull quotes.
  noir: {
    key: "noir", theme: theme("noir", "Noto Sans", "md", "comfortable"),
    sections: [
      s("hero", "overlay-left"), s("workshops", "featured"), s("about", "image-left"), s("gallery", "masonry"),
      s("video", "wide"), s("testimonials", "quote"), s("faq", "two-column"), s("location", "card"), s("contact", "cards"),
      s("footer", "centered"),
    ],
  },
};

export function isTemplateKey(v: unknown): v is TemplateKey {
  return typeof v === "string" && (TEMPLATE_KEYS as readonly string[]).includes(v);
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
  return { sections, added, hidden, removed };
}

export function applyTemplate(content: PageContent, key: TemplateKey): PageContent {
  return { ...content, sections: planTemplateSwitch(content, key).sections };
}
