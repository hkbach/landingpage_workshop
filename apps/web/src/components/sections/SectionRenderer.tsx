"use client";

import type { SectionInstance } from "@/lib/types";
import type {
  AboutProps, ContactProps, FaqProps, FooterProps, GalleryProps, HeroProps, LocationProps, RenderContext,
  TeamProps, TestimonialsProps, WorkshopsProps,
} from "./context";
import {
  AboutSection, ContactSection, FaqSection, FooterSection, GallerySection, HeroSection, LocationSection,
  TeamSection, TestimonialsSection, WorkshopsSection,
} from "./renderers";

/** Renders one section by type. Props come from untrusted shop content and are rendered defensively as text. */
export function SectionRenderer({ section, ctx }: { section: SectionInstance; ctx: RenderContext }) {
  const p = section.props;
  switch (section.type) {
    case "hero": return <HeroSection section={section} props={p as unknown as HeroProps} ctx={ctx} />;
    case "about": return <AboutSection section={section} props={p as unknown as AboutProps} ctx={ctx} />;
    case "workshops": return <WorkshopsSection section={section} props={p as unknown as WorkshopsProps} ctx={ctx} />;
    case "gallery": return <GallerySection section={section} props={p as unknown as GalleryProps} ctx={ctx} />;
    case "team": return <TeamSection section={section} props={p as unknown as TeamProps} ctx={ctx} />;
    case "testimonials": return <TestimonialsSection section={section} props={p as unknown as TestimonialsProps} ctx={ctx} />;
    case "faq": return <FaqSection section={section} props={p as unknown as FaqProps} ctx={ctx} />;
    case "location": return <LocationSection section={section} props={p as unknown as LocationProps} ctx={ctx} />;
    case "contact": return <ContactSection section={section} props={p as unknown as ContactProps} ctx={ctx} />;
    case "footer": return <FooterSection section={section} props={p as unknown as FooterProps} ctx={ctx} />;
    default: return null;
  }
}
