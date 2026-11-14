import { z } from "zod";
import { isYoutubeId, MAX_SECTION_VIDEOS, migrateVideoProps } from "./youtube";
import { LOCALES, SECTION_TYPES, type SectionType } from "./enums";
import { isPlatformMediaPath } from "./media";

// The props of each landing page section (FR-SITE-02), in one place so the editor (apps/web) and the API check a page with the same rules. Text is plain data: no HTML, links are https
// only, a map link is Google Maps only, an image is an https link or an image the platform serves itself (the editor alone also accepts an uploaded data: image while the shop is editing).

// ---- URL validators -------------------------------------------------------------------------------------------------------------------------------------

function parse(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

export function isHttpsUrl(value: string): boolean {
  return parse(value)?.protocol === "https:";
}

/** Only google.com/maps or maps.app.goo.gl over https. */
export function isAllowedMapsUrl(value: string): boolean {
  const u = parse(value);
  if (!u || u.protocol !== "https:") return false;
  const host = u.hostname.toLowerCase();
  if (host === "maps.app.goo.gl") return true;
  return (host === "google.com" || host === "www.google.com") && (u.pathname === "/maps" || u.pathname.startsWith("/maps/"));
}

/** data:image/(jpeg|png|webp);base64 - produced by the editor before an image is uploaded; valid ONLY in the builder/preview context, never stored by the API. */
const DATA_IMAGE_RE = /^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_DATA_IMAGE_LENGTH = 2_500_000;

export function isDataImageUrl(value: string): boolean {
  return value.length <= MAX_DATA_IMAGE_LENGTH && DATA_IMAGE_RE.test(value);
}

export interface ImageUrlOptions {
  /** Accept uploaded data: URLs. Only the builder and its preview may set this; never the public site or the API. */
  allowDataImages?: boolean;
}

/** https image URL, an image the platform serves itself (/api/v1/media/...), or (builder/preview only) a data:image URL. */
export function isImageUrl(value: string, opts?: ImageUrlOptions): boolean {
  return isHttpsUrl(value) || isPlatformMediaPath(value) || (opts?.allowDataImages === true && isDataImageUrl(value));
}

// ---- layouts and variants -------------------------------------------------------------------------------------------------------------------------------

/** The page layouts of the templates. */
export const LAYOUT_KEYS = ["classic", "quicklinks", "sidebar", "bento", "bookingrail", "magazine", "cinematic", "floatingcards", "journey", "appstyle"] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

/** The layout variants of each section type; the first one is the default. */
export const SECTION_VARIANTS: Record<SectionType, readonly string[]> = {
  hero: ["centered", "split", "overlay-left", "compact", "editorial", "fullscreen"],
  about: ["image-left", "image-right", "stacked"],
  workshops: ["grid", "list", "featured", "compact"],
  promotions: ["cards", "banner"],
  gallery: ["grid", "masonry", "strip"],
  team: ["cards", "inline"],
  testimonials: ["cards", "quote"],
  faq: ["accordion", "two-column"],
  location: ["simple", "card"],
  contact: ["list", "cards"],
  video: ["wide", "split"],
  footer: ["dark", "light", "centered"],
};

// ---- the props of each type -----------------------------------------------------------------------------------------------------------------------------

const optStr = (max: number) => z.string().max(max).optional();
export const localizedText = (max: number) =>
  z.object(Object.fromEntries(LOCALES.map((l) => [l, optStr(max)])) as Record<(typeof LOCALES)[number], z.ZodOptional<z.ZodString>>);
export const makeImageSchema = (allowDataImages: boolean) =>
  z.string().max(allowDataImages ? MAX_DATA_IMAGE_LENGTH : 2000).refine((v) => v === "" || isImageUrl(v, { allowDataImages }), { message: "https_url" });
const videoId = z.string().max(11).refine((v) => v === "" || isYoutubeId(v), { message: "youtube_id" });
const linkUrl = z.string().max(2000).refine((v) => v === "" || isHttpsUrl(v), { message: "https_url" });
const mapsUrl = z.string().max(2000).refine((v) => v === "" || isAllowedMapsUrl(v), { message: "maps_url" });
const socials = z.array(z.object({ label: z.string().max(40), url: linkUrl })).max(6);

export type ImageSchema = z.ZodType<string>;
/** The props schema of each section type; `image` decides which image URLs are accepted. */
export const SECTION_PROPS: Record<SectionType, (image: ImageSchema) => z.ZodObject> = {
  hero: (image) => z.object({ title: localizedText(120), subtitle: localizedText(240), imageUrl: image, ctaText: localizedText(40) }),
  about: (image) => z.object({ heading: localizedText(80), body: localizedText(2000), imageUrl: image }),
  workshops: () => z.object({ heading: localizedText(80) }),
  promotions: () => z.object({ heading: localizedText(80) }),
  gallery: (image) => z.object({ heading: localizedText(80), imageUrls: z.array(image).max(12) }),
  team: (image) => z.object({
    heading: localizedText(80),
    members: z.array(z.object({ name: z.string().max(80), role: localizedText(80), bio: localizedText(300), imageUrl: image })).max(12),
  }),
  testimonials: () => z.object({
    heading: localizedText(80),
    items: z.array(z.object({ name: z.string().max(80), country: z.string().max(60), text: localizedText(500) })).max(12),
  }),
  faq: () => z.object({ heading: localizedText(80), items: z.array(z.object({ q: localizedText(200), a: localizedText(1000) })).max(20) }),
  location: () => z.object({ heading: localizedText(80), address: localizedText(300), hours: localizedText(300), mapsUrl }),
  contact: () => z.object({
    heading: localizedText(80), phone: z.string().max(40), whatsapp: z.string().max(40),
    email: z.string().max(120).refine((v) => v === "" || z.email().safeParse(v).success, { message: "email" }), socials,
  }),
  video: () => z.object({ heading: localizedText(80), caption: localizedText(300), videos: z.array(videoId).max(MAX_SECTION_VIDEOS) }),
  footer: () => z.object({ text: localizedText(200), socials }),
};

/**
 * THE rule for the props of one section, the same in the API and in the editor: every field of the type must be there with the shape the editor gives it (a missing field is refused:
 * `invalid_type`), and a field the type does not have is refused (`unrecognized_keys`). Images are https links or platform images only; `allowDataImages` (the editor and its preview, never
 * the API) also accepts an uploaded data: image. A `video` section written with the old single `videoId` is upgraded first.
 */
export function checkSectionProps(type: SectionType, props: Record<string, unknown>, opts: { allowDataImages?: boolean } = {}) {
  // Only the OLD shape (one `videoId`, no `videos`) is upgraded; a `videos` list is checked as it is (at most five, valid ids), never quietly cut down.
  const input = type === "video" && props.videos === undefined ? migrateVideoProps(props) : props;
  return SECTION_PROPS[type](makeImageSchema(opts.allowDataImages === true)).strict().safeParse(input);
}

export const isSectionType = (v: unknown): v is SectionType => typeof v === "string" && (SECTION_TYPES as readonly string[]).includes(v);
