import type { SectionType } from "@workshop/shared";
import type { PageContent, PageTheme, SectionInstance } from "@/lib/types";
import { createSection } from "./registry";

export type TemplateKey = "classic" | "minimal";

export interface TemplateDef { key: TemplateKey; sections: SectionType[]; theme: PageTheme }

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  classic: {
    key: "classic",
    sections: ["hero", "about", "workshops", "gallery", "team", "testimonials", "faq", "location", "contact", "footer"],
    theme: { palette: "warm", primary: "#9a3412", font: "Inter" },
  },
  minimal: {
    key: "minimal",
    sections: ["hero", "workshops", "faq", "location", "footer"],
    theme: { palette: "mono", primary: "#27272a", font: "System" },
  },
};

/** Switch template: keep existing content of sections with the same type (FR-SITE-01). */
export function applyTemplate(content: PageContent, key: TemplateKey): PageContent {
  const sections: SectionInstance[] = TEMPLATES[key].sections.map((type) => {
    const existing = content.sections.find((s) => s.type === type);
    return existing ?? createSection(type);
  });
  return { ...content, sections };
}
