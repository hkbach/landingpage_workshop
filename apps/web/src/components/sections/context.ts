import type { Locale, Localized } from "@workshop/shared";
import type { Shop, Workshop } from "@/lib/types";

/** Serializable render context shared by the builder preview and the public site. */
export interface RenderContext {
  locale: Locale;
  shop: Pick<Shop, "name" | "defaultLocale" | "enabledLocales" | "timezone" | "currency">;
  /** ACTIVE workshops only; the workshops section never takes manual content. */
  workshops: Workshop[];
  reportHref: string;
  privacyHref: string;
  /** Builder preview only: allow uploaded data:image URLs. Always false/absent on the public site. */
  allowDataImages?: boolean;
}

export interface SocialLink { label: string; url: string }
export interface HeroProps { title: Localized; subtitle: Localized; imageUrl: string; ctaText: Localized }
export interface AboutProps { heading: Localized; body: Localized; imageUrl: string }
export interface WorkshopsProps { heading: Localized }
export interface GalleryProps { heading: Localized; imageUrls: string[] }
export interface TeamProps { heading: Localized; members: { name: string; role: Localized; bio: Localized; imageUrl: string }[] }
export interface TestimonialsProps { heading: Localized; items: { name: string; country: string; text: Localized }[] }
export interface FaqProps { heading: Localized; items: { q: Localized; a: Localized }[] }
export interface LocationProps { heading: Localized; address: Localized; hours: Localized; mapsUrl: string }
export interface ContactProps { heading: Localized; phone: string; whatsapp: string; email: string; socials: SocialLink[] }
export interface VideoProps { heading: Localized; caption: Localized; videoId: string }
export interface FooterProps { text: Localized; socials: SocialLink[] }
