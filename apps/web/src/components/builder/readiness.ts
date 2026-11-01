import type { Localized } from "@workshop/shared";
import { needsAttention, failingThemeChecks } from "@/components/sections/instance";
import type { PageTheme, SectionInstance, Shop } from "@/lib/types";
import type { Prerequisite } from "./publish-state";

export type ReadinessShop = Pick<Shop, "name" | "defaultLocale" | "contactEmail" | "contactPhone">;

/** The publish checklist (FR-SITE-04). Used by the builder and by the Publish button of the landing page list. */
export function pagePrerequisites(sections: readonly SectionInstance[], theme: PageTheme, shop: ReadinessShop, upcomingWorkshopCount: number): Prerequisite[] {
  const hero = sections.find((s) => s.type === "hero" && s.enabled);
  const heroTitle = (hero?.props.title ?? {}) as Localized;
  const contact = sections.find((s) => s.type === "contact" && s.enabled);
  const hasContact = !!(contact && (contact.props.phone || contact.props.email || contact.props.whatsapp)) || !!(shop.contactEmail || shop.contactPhone);
  return [
    { key: "identity", met: !!(theme.logoUrl || shop.name) },
    { key: "hero", met: !!hero && !!heroTitle[shop.defaultLocale]?.trim() },
    { key: "contact", met: hasContact },
    { key: "workshop", met: upcomingWorkshopCount > 0 },
  ];
}

/** Enabled sections with invalid props or colours: they block Publish. */
export function invalidSectionCount(sections: readonly SectionInstance[], theme: PageTheme): number {
  return sections.filter((s) => s.enabled && needsAttention(s, theme)).length;
}

export const themeIsInvalid = (theme: PageTheme) => failingThemeChecks(theme).length > 0;
