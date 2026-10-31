import { isYoutubeId, type SectionType } from "@workshop/shared";
import type { SectionInstance } from "@/lib/types";
import { SECTION_REGISTRY } from "../registry";

// Pure helpers shared by the page frames (grouping sections into tabs / tiles / journey steps, navigation items).
// Kept free of React so they can be unit-tested.

/** Footer used when a stored draft has none: the footer is mandatory and must appear in every frame. */
export const FALLBACK_FOOTER: SectionInstance = {
  id: "footer-fallback", type: "footer", enabled: true, variant: "dark", props: SECTION_REGISTRY.footer.defaultProps(),
};

export interface SplitSections {
  /** Enabled sections in page order, without the footer. */
  body: SectionInstance[];
  /** The footer (always enabled) rendered by every frame. */
  footer: SectionInstance;
}

export function splitSections(sections: SectionInstance[]): SplitSections {
  const footer = sections.find((s) => s.type === "footer");
  return {
    body: sections.filter((s) => s.enabled && s.type !== "footer"),
    footer: footer ? { ...footer, enabled: true } : FALLBACK_FOOTER,
  };
}

const nonEmptyList = (v: unknown, key?: string): boolean =>
  Array.isArray(v) && v.some((x) => (key ? !!x && typeof x === "object" : typeof x === "string" && x.trim() !== ""));

/** Whether the section draws anything (mirrors the renderers that return null for empty content). */
export function isRenderable(section: SectionInstance): boolean {
  const p = section.props;
  switch (section.type) {
    case "gallery": return nonEmptyList(p.imageUrls);
    case "team": return nonEmptyList(p.members, "x");
    case "testimonials":
    case "faq": return nonEmptyList(p.items, "x");
    case "video": return Array.isArray(p.videos) && p.videos.some((v) => isYoutubeId(v));
    default: return true;
  }
}

export interface NavItem { id: string; type: SectionType; href: string }

/** Anchor navigation: one entry per visible section (the hero is the page top, the footer is not listed). */
export function navItems(body: SectionInstance[]): NavItem[] {
  return body
    .filter((s) => s.type !== "hero" && isRenderable(s))
    .map((s) => ({ id: s.id, type: s.type, href: `#s-${s.id}` }));
}

// --- App style: sections grouped into tabs --------------------------------------------------------------------------

export const TAB_KEYS = ["overview", "workshops", "gallery", "info"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

const TAB_OF_TYPE: Record<SectionType, TabKey> = {
  hero: "overview", about: "overview", team: "overview", testimonials: "overview",
  workshops: "workshops",
  gallery: "gallery", video: "gallery",
  faq: "info", location: "info", contact: "info", footer: "info",
};

export interface TabGroup { key: TabKey; sections: SectionInstance[] }

/**
 * Groups the body sections into tabs (Overview / Workshops / Gallery / Info). Only tabs with something to show exist;
 * every body section lands in exactly one tab (sections that draw nothing join the first tab so none is dropped).
 */
export function groupIntoTabs(body: SectionInstance[]): TabGroup[] {
  const buckets = new Map<TabKey, SectionInstance[]>();
  const empty: SectionInstance[] = [];
  for (const s of body) {
    if (!isRenderable(s)) { empty.push(s); continue; }
    const key = TAB_OF_TYPE[s.type];
    buckets.set(key, [...(buckets.get(key) ?? []), s]);
  }
  const tabs: TabGroup[] = TAB_KEYS.filter((k) => buckets.has(k)).map((key) => ({ key, sections: buckets.get(key)! }));
  if (empty.length === 0) return tabs;
  if (tabs.length === 0) return [{ key: "overview", sections: empty }];
  const order = new Map(body.map((s, i) => [s.id, i]));
  tabs[0] = { ...tabs[0]!, sections: [...tabs[0]!.sections, ...empty].sort((a, b) => order.get(a.id)! - order.get(b.id)!) };
  return tabs;
}

/** Tab to reveal for a URL hash (`#s-<sectionId>` or `#tab-<key>`); null when the hash targets nothing in the tabs. */
export function tabForHash(tabs: TabGroup[], hash: string): TabKey | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (h.startsWith("tab-")) return tabs.find((t) => `tab-${t.key}` === h)?.key ?? null;
  if (h.startsWith("s-")) return tabs.find((t) => t.sections.some((s) => `s-${s.id}` === h))?.key ?? null;
  return null;
}

// --- Bento grid ------------------------------------------------------------------------------------------------------

export type BentoSize = "xl" | "wide" | "tall" | "sq";
export interface BentoTile {
  key: string;
  /** section = whole section; workshop = one workshop card; image = one gallery photo */
  kind: "section" | "workshop" | "image";
  section: SectionInstance;
  /** workshop / image index inside its section */
  index: number;
  size: BentoSize;
}

const IMAGE_SIZES: BentoSize[] = ["tall", "sq", "sq", "wide", "sq", "tall"];
const MAX_IMAGE_TILES = 8;

/**
 * Plans the bento tiles: the hero is the big tile, workshops become one tile each, gallery photos become image tiles
 * and the other sections are wide tiles. Every body section is represented by at least one tile.
 */
export function planBento(body: SectionInstance[], opts: { workshopCount: number; imageCount: number }): BentoTile[] {
  const tiles: BentoTile[] = [];
  for (const s of body) {
    if (!isRenderable(s)) continue;
    if (s.type === "hero") {
      tiles.push({ key: s.id, kind: "section", section: s, index: 0, size: "xl" });
    } else if (s.type === "workshops" && opts.workshopCount > 0) {
      for (let i = 0; i < opts.workshopCount; i++) {
        tiles.push({ key: `${s.id}:${i}`, kind: "workshop", section: s, index: i, size: opts.workshopCount <= 2 ? "wide" : "tall" });
      }
    } else if (s.type === "gallery" && opts.imageCount > 0) {
      const n = Math.min(opts.imageCount, MAX_IMAGE_TILES);
      for (let i = 0; i < n; i++) {
        tiles.push({ key: `${s.id}:${i}`, kind: "image", section: s, index: i, size: IMAGE_SIZES[i % IMAGE_SIZES.length]! });
      }
    } else {
      tiles.push({ key: s.id, kind: "section", section: s, index: 0, size: "wide" });
    }
  }
  return tiles;
}

// --- Journey ---------------------------------------------------------------------------------------------------------

export type JourneyStep = "discover" | "choose" | "visit" | "book";
const STEP_OF_TYPE: Record<SectionType, JourneyStep> = {
  hero: "discover", about: "discover", team: "discover", gallery: "discover", video: "discover",
  workshops: "choose", testimonials: "choose",
  location: "visit", faq: "visit",
  contact: "book", footer: "book",
};

export interface JourneyRun { step: JourneyStep; number: number; sections: SectionInstance[] }

/** Consecutive sections with the same step label share one marker on the rail; numbers count the markers. */
export function journeyRuns(body: SectionInstance[]): JourneyRun[] {
  const runs: JourneyRun[] = [];
  for (const s of body) {
    if (!isRenderable(s)) continue;
    const step = STEP_OF_TYPE[s.type];
    const last = runs[runs.length - 1];
    if (last && last.step === step) last.sections.push(s);
    else runs.push({ step, number: runs.length + 1, sections: [s] });
  }
  return runs;
}

/** "01", "02", ... chapter numbers of the magazine layout. */
export function chapterNumber(index: number): string {
  return String(index + 1).padStart(2, "0");
}
