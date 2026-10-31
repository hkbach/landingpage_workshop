"use client";

import type { PageTheme, SectionInstance } from "@/lib/types";
import type {
  AboutProps, ContactProps, FaqProps, FooterProps, GalleryProps, HeroProps, LocationProps, RenderContext,
  TeamProps, TestimonialsProps, VideoProps, WorkshopsProps,
} from "./context";
import { effectiveVariant, SECTION_REGISTRY } from "./registry";
import { AboutSection, GallerySection, HeroSection, TeamSection, WorkshopsSection } from "./renderers";
import { ContactSection, FaqSection, FooterSection, LocationSection, TestimonialsSection, VideoSection } from "./renderers-more";
import { resolveThemeColors, sectionStyleVars } from "./theme";

/**
 * Renders one section by type. Props come from untrusted shop content and are rendered defensively as text.
 * Per-section colour overrides are applied only as CSS custom properties (validated hex) on a wrapper element.
 */
export function SectionRenderer({ section, ctx, theme }: { section: SectionInstance; ctx: RenderContext; theme: PageTheme }) {
  const p = section.props;
  const variant = effectiveVariant(section);
  const tone = SECTION_REGISTRY[section.type].tone(variant);
  const vars = sectionStyleVars(resolveThemeColors(theme), tone, section.style);
  const common = { section, ctx, variant };
  let body = null;
  switch (section.type) {
    case "hero": body = <HeroSection {...common} props={p as unknown as HeroProps} />; break;
    case "about": body = <AboutSection {...common} props={p as unknown as AboutProps} />; break;
    case "workshops": body = <WorkshopsSection {...common} props={p as unknown as WorkshopsProps} />; break;
    case "gallery": body = <GallerySection {...common} props={p as unknown as GalleryProps} />; break;
    case "team": body = <TeamSection {...common} props={p as unknown as TeamProps} />; break;
    case "testimonials": body = <TestimonialsSection {...common} props={p as unknown as TestimonialsProps} />; break;
    case "faq": body = <FaqSection {...common} props={p as unknown as FaqProps} />; break;
    case "location": body = <LocationSection {...common} props={p as unknown as LocationProps} />; break;
    case "contact": body = <ContactSection {...common} props={p as unknown as ContactProps} />; break;
    case "video": body = <VideoSection {...common} props={p as unknown as VideoProps} />; break;
    case "footer": body = <FooterSection {...common} props={p as unknown as FooterProps} />; break;
  }
  if (!body) return null;
  // display:contents keeps the layout unchanged; the variables inherit into the section element.
  return <div className="contents" style={vars} data-section={section.type} data-variant={variant}>{body}</div>;
}
