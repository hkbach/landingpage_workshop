import { z } from "zod";
import { isYoutubeId, LOCALES, MAX_SECTION_VIDEOS, migrateVideoProps, type Localized, type SectionType } from "@workshop/shared";
import type { SectionInstance } from "@/lib/types";
import { isAllowedMapsUrl, isHttpsUrl, isImageUrl, MAX_DATA_IMAGE_LENGTH } from "./safe-url";
import type { Tone } from "./theme";
import { newUuid } from "@/lib/uuid";

// Section registry (FR-SITE-02): per type -> schema, defaults, layout variants and a field descriptor that drives the
// generic editor. All templates share these 12 types and one renderer per type (the variant is a renderer prop).

export type FieldDef =
  | { kind: "localized"; key: string; max: number; multiline?: boolean }
  | { kind: "plain"; key: string; max: number; inputType?: "text" | "tel" | "email" }
  | { kind: "image"; key: string }
  | { kind: "youtube"; key: string }
  | { kind: "youtubeList"; key: string; max: number }
  | { kind: "link"; key: string }
  | { kind: "maps"; key: string }
  | { kind: "select"; key: string; options: readonly string[] }
  | { kind: "imageList"; key: string; max: number }
  | { kind: "list"; key: string; max: number; titleKey: string; fields: FieldDef[]; newItem: () => Record<string, unknown> };

export interface SectionDef {
  type: SectionType;
  /** Bumped when the stored props shape changes; `migrateProps` upgrades older stored props (never edit stored JSON by hand). */
  schemaVersion: 1 | 2;
  migrateProps?: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Strict schema (public site / backend): https image URLs only. */
  schema: z.ZodType<Record<string, unknown>>;
  /** Builder/preview schema: additionally accepts uploaded data:image URLs. */
  builderSchema: z.ZodType<Record<string, unknown>>;
  /** Layout variants of the section renderer; the first one is the default. */
  variants: readonly string[];
  /** Background tone for a given variant (drives colour resolution and contrast checks). */
  tone: (variant: string) => Tone;
  defaultProps: () => Record<string, unknown>;
  fields: FieldDef[];
  /** Shown in the builder with an authenticity reminder. */
  authenticityNote?: boolean;
  /** Content comes from the workshop catalogue, not from the section props. */
  autoContent?: boolean;
  removable: boolean;
}

const optStr = (max: number) => z.string().max(max).optional();
const localized = (max: number) =>
  z.object(Object.fromEntries(LOCALES.map((l) => [l, optStr(max)])) as Record<(typeof LOCALES)[number], z.ZodOptional<z.ZodString>>);
const makeImage = (allowDataImages: boolean) =>
  z.string().max(allowDataImages ? MAX_DATA_IMAGE_LENGTH : 2000).refine((v) => v === "" || isImageUrl(v, { allowDataImages }), { message: "https_url" });
const videoId = z.string().max(11).refine((v) => v === "" || isYoutubeId(v), { message: "youtube_id" });
const linkUrl = z.string().max(2000).refine((v) => v === "" || isHttpsUrl(v), { message: "https_url" });
const mapsUrl = z.string().max(2000).refine((v) => v === "" || isAllowedMapsUrl(v), { message: "maps_url" });
const socials = z.array(z.object({ label: z.string().max(40), url: linkUrl })).max(6);
const asSchema = (s: z.ZodType<unknown>) => s as unknown as z.ZodType<Record<string, unknown>>;

const SOCIAL_FIELDS: FieldDef = {
  kind: "list", key: "socials", max: 6, titleKey: "label",
  fields: [{ kind: "plain", key: "label", max: 40 }, { kind: "link", key: "url" }],
  newItem: () => ({ label: "", url: "" }),
};

// Default FAQ entry about late arrival (shop content, editable by the shop). Mirrors BR-09.
export const LATE_POLICY_FAQ: { q: Localized; a: Localized } = {
  q: {
    en: "What if I arrive late?",
    vi: "Nếu tôi đến trễ thì sao?",
    ko: "늦게 도착하면 어떻게 되나요?",
    ja: "遅刻した場合はどうなりますか？",
    zh: "如果我迟到了怎么办？",
  },
  a: {
    en: "Please arrive on time. If you arrive more than 30 minutes late, your booking may be released and your spot may be offered to walk-in guests. If spots are still available when you arrive, you may still be able to join.",
    vi: "Vui lòng đến đúng giờ. Nếu bạn đến trễ hơn 30 phút, đặt chỗ có thể bị hủy giữ chỗ và chỗ của bạn có thể được nhường cho khách đến trực tiếp. Nếu khi bạn đến vẫn còn chỗ, bạn vẫn có thể tham gia.",
    ko: "정시에 도착해 주세요. 30분 이상 늦으면 예약이 해제되어 자리가 현장 방문 고객에게 제공될 수 있습니다. 도착했을 때 자리가 남아 있다면 참여하실 수 있습니다.",
    ja: "時間通りにお越しください。30分以上遅れた場合、予約が解除され、席が飛び込みのお客様に提供されることがあります。到着時に空席があればご参加いただける場合があります。",
    zh: "请准时到达。如果您迟到超过30分钟，您的预订可能会被释放，名额可能会提供给现场散客。如果您到达时仍有空位，您仍有可能参加。",
  },
};

type ImageSchema = z.ZodType<string>;
type Define = Omit<SectionDef, "schema" | "builderSchema"> & { make: (image: ImageSchema) => z.ZodType<unknown> };

const fixed = (tone: Tone) => () => tone;

const DEFINITIONS: Record<SectionType, Define> = {
  hero: {
    type: "hero", schemaVersion: 1, removable: true,
    variants: ["centered", "split", "overlay-left", "compact", "editorial", "fullscreen"],
    // compact (avatar header), editorial (headline) and fullscreen (dark cinematic cover) sit on the page background, the rest on primary.
    tone: (v) => (v === "compact" || v === "editorial" || v === "fullscreen" ? "bg" : "primary"),
    make: (image) => z.object({ title: localized(120), subtitle: localized(240), imageUrl: image, ctaText: localized(40) }),
    defaultProps: () => ({ title: { en: "Make something with your hands" }, subtitle: { en: "Hands-on workshops, no experience needed" }, imageUrl: "", ctaText: { en: "Book a workshop" } }),
    fields: [
      { kind: "localized", key: "title", max: 120 }, { kind: "localized", key: "subtitle", max: 240 },
      { kind: "image", key: "imageUrl" }, { kind: "localized", key: "ctaText", max: 40 },
    ],
  },
  about: {
    type: "about", schemaVersion: 1, removable: true,
    variants: ["image-left", "image-right", "stacked"], tone: fixed("bg"),
    make: (image) => z.object({ heading: localized(80), body: localized(2000), imageUrl: image }),
    defaultProps: () => ({ heading: { en: "About us" }, body: { en: "" }, imageUrl: "" }),
    fields: [{ kind: "localized", key: "heading", max: 80 }, { kind: "localized", key: "body", max: 2000, multiline: true }, { kind: "image", key: "imageUrl" }],
  },
  workshops: {
    type: "workshops", schemaVersion: 1, removable: true, autoContent: true,
    variants: ["grid", "list", "featured", "compact"], tone: fixed("surface"),
    make: () => z.object({ heading: localized(80) }),
    defaultProps: () => ({ heading: { en: "Our workshops" } }),
    fields: [{ kind: "localized", key: "heading", max: 80 }],
  },
  promotions: {
    // Content comes from Promotion management (the promotions that are active today), like the workshops section.
    type: "promotions", schemaVersion: 1, removable: true, autoContent: true,
    variants: ["cards", "banner"], tone: fixed("surface"),
    make: () => z.object({ heading: localized(80) }),
    defaultProps: () => ({ heading: { en: "Special offers" } }),
    fields: [{ kind: "localized", key: "heading", max: 80 }],
  },
  gallery: {
    type: "gallery", schemaVersion: 1, removable: true,
    variants: ["grid", "masonry", "strip"], tone: fixed("bg"),
    make: (image) => z.object({ heading: localized(80), imageUrls: z.array(image).max(12) }),
    defaultProps: () => ({ heading: { en: "Gallery" }, imageUrls: [] }),
    fields: [{ kind: "localized", key: "heading", max: 80 }, { kind: "imageList", key: "imageUrls", max: 12 }],
  },
  team: {
    type: "team", schemaVersion: 1, removable: true,
    variants: ["cards", "inline"], tone: fixed("surface"),
    make: (image) => z.object({
      heading: localized(80),
      members: z.array(z.object({ name: z.string().max(80), role: localized(80), bio: localized(300), imageUrl: image })).max(12),
    }),
    defaultProps: () => ({ heading: { en: "Meet the team" }, members: [] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 },
      {
        kind: "list", key: "members", max: 12, titleKey: "name",
        fields: [{ kind: "plain", key: "name", max: 80 }, { kind: "localized", key: "role", max: 80 }, { kind: "localized", key: "bio", max: 300, multiline: true }, { kind: "image", key: "imageUrl" }],
        newItem: () => ({ name: "", role: {}, bio: {}, imageUrl: "" }),
      },
    ],
  },
  testimonials: {
    type: "testimonials", schemaVersion: 1, removable: true, authenticityNote: true,
    variants: ["cards", "quote"], tone: fixed("bg"),
    make: () => z.object({
      heading: localized(80),
      items: z.array(z.object({ name: z.string().max(80), country: z.string().max(60), text: localized(500) })).max(12),
    }),
    defaultProps: () => ({ heading: { en: "What guests say" }, items: [] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 },
      {
        kind: "list", key: "items", max: 12, titleKey: "name",
        fields: [{ kind: "plain", key: "name", max: 80 }, { kind: "plain", key: "country", max: 60 }, { kind: "localized", key: "text", max: 500, multiline: true }],
        newItem: () => ({ name: "", country: "", text: {} }),
      },
    ],
  },
  faq: {
    type: "faq", schemaVersion: 1, removable: true,
    variants: ["accordion", "two-column"], tone: fixed("surface"),
    make: () => z.object({ heading: localized(80), items: z.array(z.object({ q: localized(200), a: localized(1000) })).max(20) }),
    defaultProps: () => ({ heading: { en: "FAQ" }, items: [{ q: { ...LATE_POLICY_FAQ.q }, a: { ...LATE_POLICY_FAQ.a } }] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 },
      {
        kind: "list", key: "items", max: 20, titleKey: "q",
        fields: [{ kind: "localized", key: "q", max: 200 }, { kind: "localized", key: "a", max: 1000, multiline: true }],
        newItem: () => ({ q: {}, a: {} }),
      },
    ],
  },
  location: {
    type: "location", schemaVersion: 1, removable: true,
    variants: ["simple", "card"], tone: fixed("bg"),
    make: () => z.object({ heading: localized(80), address: localized(300), hours: localized(300), mapsUrl }),
    defaultProps: () => ({ heading: { en: "Find us" }, address: { en: "" }, hours: { en: "" }, mapsUrl: "" }),
    fields: [
      { kind: "localized", key: "heading", max: 80 }, { kind: "localized", key: "address", max: 300 },
      { kind: "localized", key: "hours", max: 300, multiline: true }, { kind: "maps", key: "mapsUrl" },
    ],
  },
  contact: {
    type: "contact", schemaVersion: 1, removable: true,
    variants: ["list", "cards"], tone: fixed("surface"),
    make: () => z.object({
      heading: localized(80), phone: z.string().max(40), whatsapp: z.string().max(40),
      email: z.string().max(120).refine((v) => v === "" || z.email().safeParse(v).success, { message: "email" }), socials,
    }),
    defaultProps: () => ({ heading: { en: "Contact" }, phone: "", whatsapp: "", email: "", socials: [] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 }, { kind: "plain", key: "phone", max: 40, inputType: "tel" },
      { kind: "plain", key: "whatsapp", max: 40, inputType: "tel" }, { kind: "plain", key: "email", max: 120, inputType: "email" }, SOCIAL_FIELDS,
    ],
  },
  video: {
    // v2: up to MAX_SECTION_VIDEOS videos (v1 stored a single `videoId`).
    type: "video", schemaVersion: 2, removable: true, migrateProps: migrateVideoProps,
    variants: ["wide", "split"], tone: fixed("bg"),
    // Only validated 11-char video IDs are stored; the raw link is never kept (see parseYoutubeId).
    make: () => z.object({ heading: localized(80), caption: localized(300), videos: z.array(videoId).max(MAX_SECTION_VIDEOS) }),
    defaultProps: () => ({ heading: { en: "See it in action" }, caption: { en: "" }, videos: [] }),
    fields: [
      { kind: "localized", key: "heading", max: 80 }, { kind: "localized", key: "caption", max: 300, multiline: true },
      { kind: "youtubeList", key: "videos", max: MAX_SECTION_VIDEOS },
    ],
  },
  footer: {
    type: "footer", schemaVersion: 1, removable: false,
    variants: ["dark", "light", "centered"], tone: (v) => (v === "light" ? "surface" : "inverse"),
    make: () => z.object({ text: localized(200), socials }),
    defaultProps: () => ({ text: { en: "" }, socials: [] }),
    fields: [{ kind: "localized", key: "text", max: 200 }, SOCIAL_FIELDS],
  },
};

export const SECTION_REGISTRY = Object.fromEntries(
  (Object.entries(DEFINITIONS) as [SectionType, Define][]).map(([type, { make, ...def }]) => [
    type,
    { ...def, schema: asSchema(make(makeImage(false))), builderSchema: asSchema(make(makeImage(true))) },
  ]),
) as Record<SectionType, SectionDef>;

export const ADDABLE_TYPES: SectionType[] = ["hero", "about", "workshops", "promotions", "gallery", "team", "testimonials", "faq", "location", "contact", "video"];

export function defaultVariant(type: SectionType): string {
  return SECTION_REGISTRY[type].variants[0]!;
}
export function isValidVariant(type: SectionType, variant: unknown): variant is string {
  return typeof variant === "string" && SECTION_REGISTRY[type].variants.includes(variant);
}
/** Whether each section type shows a Book button when the shop has not chosen (hero CTA and workshop cards are on). */
export const BOOK_BUTTON_DEFAULT: Record<SectionType, boolean> = {
  hero: true, about: false, workshops: true, promotions: false, gallery: false, team: false, testimonials: false,
  faq: false, location: false, contact: false, video: false, footer: false,
};

/** The footer is locked and never carries a Book button; every other section can. */
export function supportsBookButton(type: SectionType): boolean {
  return type !== "footer";
}

export function isBookButtonShown(section: Pick<SectionInstance, "type" | "showBook">): boolean {
  if (!supportsBookButton(section.type)) return false;
  return section.showBook ?? BOOK_BUTTON_DEFAULT[section.type];
}

/** Variant to render: the section's own when valid, otherwise the registry default. */
export function effectiveVariant(section: Pick<SectionInstance, "type" | "variant">): string {
  return isValidVariant(section.type, section.variant) ? section.variant : defaultVariant(section.type);
}

export function createSection(type: SectionType, variant?: string): SectionInstance {
  return {
    id: newUuid(), type, enabled: true,
    variant: isValidVariant(type, variant) ? variant : defaultVariant(type),
    props: SECTION_REGISTRY[type].defaultProps(),
  };
}

/** Collect the non-empty localized values of a section's props (used for missing-translation warnings). */
export function collectLocalized(fields: FieldDef[], props: Record<string, unknown>): Localized[] {
  const out: Localized[] = [];
  for (const f of fields) {
    const v = props[f.key];
    if (f.kind === "localized") {
      const loc = (v ?? {}) as Localized;
      // Optional text that is empty in every language is not flagged.
      if (Object.values(loc).some((s) => s?.trim())) out.push(loc);
    } else if (f.kind === "list" && Array.isArray(v)) {
      for (const item of v) out.push(...collectLocalized(f.fields, item as Record<string, unknown>));
    }
  }
  return out;
}

export interface ValidateOptions {
  /** Builder/preview context: accept uploaded data:image URLs. Never set for the public site or the API. */
  allowDataImages?: boolean;
}

export function validateSection(type: SectionType, props: Record<string, unknown>, opts?: ValidateOptions): string[] {
  const def = SECTION_REGISTRY[type];
  const res = (opts?.allowDataImages ? def.builderSchema : def.schema).safeParse(props);
  return res.success ? [] : res.error.issues.map((i) => `${i.path.join(".")}:${i.message}`);
}

// --- "has the shop edited this section?" (used when switching templates so no content is lost) ---------------------
function prune(v: unknown): unknown {
  if (typeof v === "string") return v.trim() === "" ? undefined : v;
  if (Array.isArray(v)) {
    const a = v.map(prune).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => [k, prune(x)] as const)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return entries.length ? Object.fromEntries(entries) : undefined;
  }
  return v ?? undefined;
}

/** True when the props differ from the registry defaults (ignoring empty values). Auto-content sections never do. */
/** Upgrade stored props written by an older schema version of the section type (no-op for types without a migration). */
export function migrateSectionProps(type: SectionType, props: Record<string, unknown>): Record<string, unknown> {
  return SECTION_REGISTRY[type].migrateProps?.(props) ?? props;
}

export function hasContent(section: Pick<SectionInstance, "type" | "props">): boolean {
  const def = SECTION_REGISTRY[section.type];
  if (def.autoContent) return false;
  return JSON.stringify(prune(section.props)) !== JSON.stringify(prune(def.defaultProps()));
}
