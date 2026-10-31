"use client";

import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { effectiveVariant, SECTION_REGISTRY } from "@/components/sections/registry";
import { resolveSectionColors, resolveThemeColors, sanitizeSectionStyle, sectionChecks } from "@/components/sections/theme";
import type { PageTheme, SectionInstance, SectionStyle } from "@/lib/types";
import { ColorField, ContrastBadges } from "./ColorField";

const KEYS = ["background", "text", "accent"] as const;

/** Per-section colour overrides (hex only) with live contrast badges and a reset to the template colours. */
export function SectionColorsGroup({ section, theme, onChange }: {
  section: SectionInstance; theme: PageTheme; onChange: (style: SectionStyle | undefined) => void;
}) {
  const t = useTranslations("builder");
  const tone = SECTION_REGISTRY[section.type].tone(effectiveVariant(section));
  const themeColors = resolveThemeColors(theme);
  const style = sanitizeSectionStyle(section.style);
  const effective = resolveSectionColors(themeColors, tone, style);
  const checks = sectionChecks(themeColors, tone, style);
  const fallback = { background: effective.bg, text: effective.text, accent: effective.accent };

  function set(key: (typeof KEYS)[number], hex: string | undefined) {
    const next: SectionStyle = { ...style };
    if (hex) next[key] = hex;
    else delete next[key];
    onChange(Object.keys(next).length ? next : undefined);
  }

  return (
    <fieldset className="space-y-3 rounded-lg border p-3">
      <legend className="px-1 text-sm font-medium">{t("colors.title")}</legend>
      <p className="text-xs text-muted-foreground">{t("colors.hint")}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {KEYS.map((k) => (
          <ColorField
            key={`${section.id}-${k}`} id={`${section.id}-style-${k}`} label={t(`colors.keys.${k}`)} optional
            value={style[k]} fallback={fallback[k]} onChange={(hex) => set(k, hex)}
          />
        ))}
      </div>
      <ContrastBadges checks={checks} />
      <Button type="button" variant="outline" size="sm" disabled={Object.keys(style).length === 0} onClick={() => onChange(undefined)}>
        <RotateCcw />{t("colors.resetTemplate")}
      </Button>
    </fieldset>
  );
}
