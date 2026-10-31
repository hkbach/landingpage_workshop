import { z } from "zod";
import { isHexColor, SECTION_TYPES } from "@workshop/shared";
import type { PageTheme, SectionInstance } from "@/lib/types";
import { effectiveVariant, isValidVariant, SECTION_REGISTRY, validateSection } from "./registry";
import {
  invalidStyleKeys, resolveThemeColors, sectionChecks, themeChecks, type ContrastCheck,
} from "./theme";

const hex = z.string().refine(isHexColor, { message: "hex_color" });

/** Zod schema of a stored section (what the API will validate on PUT draft_content). Public (strict) image rules. */
export const sectionInstanceSchema = z
  .object({
    id: z.string().min(1).max(64),
    type: z.enum(SECTION_TYPES),
    enabled: z.boolean(),
    variant: z.string().max(40).optional(),
    props: z.record(z.string(), z.unknown()),
    style: z.object({ background: hex.optional(), text: hex.optional(), accent: hex.optional() }).strict().optional(),
  })
  .superRefine((s, ctx) => {
    if (s.variant !== undefined && !isValidVariant(s.type, s.variant)) {
      ctx.addIssue({ code: "custom", path: ["variant"], message: "unknown_variant" });
    }
    for (const issue of validateSection(s.type, s.props)) {
      ctx.addIssue({ code: "custom", path: ["props"], message: issue });
    }
  });

export interface SectionProblems {
  /** Props that do not match the registry schema (builder rules: data: images allowed). */
  props: string[];
  /** Style keys that are not valid hex colours. */
  style: string[];
  /** Failing contrast checks (< 4.5:1) of the effective colours. */
  contrast: ContrastCheck[];
}

/** Everything that makes a section "Needs attention" and blocks Publish/Submit. */
export function sectionProblems(section: SectionInstance, theme: PageTheme): SectionProblems {
  const tone = SECTION_REGISTRY[section.type].tone(effectiveVariant(section));
  return {
    props: validateSection(section.type, section.props, { allowDataImages: true }),
    style: invalidStyleKeys(section.style),
    contrast: sectionChecks(resolveThemeColors(theme), tone, section.style).filter((c) => !c.ok),
  };
}

export function needsAttention(section: SectionInstance, theme: PageTheme): boolean {
  const p = sectionProblems(section, theme);
  return p.props.length > 0 || p.style.length > 0 || p.contrast.length > 0;
}

export function failingThemeChecks(theme: PageTheme): ContrastCheck[] {
  return themeChecks(theme).filter((c) => !c.ok);
}
