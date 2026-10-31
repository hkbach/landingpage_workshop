"use client";

import { useTranslations } from "next-intl";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FONTS, PALETTES, paletteTokens, resolveThemeColors, themeChecks } from "@/components/sections/theme";
import type { PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ColorField, ContrastBadges } from "./ColorField";
import { ImageUploadField } from "./ImageUploadField";

type ColorToken = "primary" | "background" | "text" | "surface";
const TOKENS: ColorToken[] = ["primary", "background", "text", "surface"];

export function ThemePanel({ theme, templateTheme, onChange }: {
  theme: PageTheme;
  /** Theme of the current template, used by "Reset to template colors". */
  templateTheme: PageTheme;
  onChange: (patch: Partial<PageTheme>) => void;
}) {
  const t = useTranslations("builder");
  const colors = resolveThemeColors(theme);
  const checks = themeChecks(theme);
  const tpl = paletteColors(templateTheme);
  const isTemplateColors = TOKENS.every((k) => colors[k] === tpl[k]);

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("theme.palette")}</legend>
        <p className="text-xs text-muted-foreground">{t("theme.paletteHint")}</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PALETTES.map((p) => (
            <label
              key={p.key}
              className={cn(
                "relative flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                theme.palette === p.key && "border-primary ring-2 ring-primary/30",
              )}
            >
              <input type="radio" name="palette" className="sr-only" checked={theme.palette === p.key} onChange={() => onChange(paletteTokens(p.key))} />
              <span className="flex shrink-0">
                {[p.primary, p.background, p.surface, p.text].map((c, i) => (
                  <span key={i} className="size-4 border first:rounded-l last:rounded-r" style={{ backgroundColor: c }} aria-hidden />
                ))}
              </span>
              <span className="truncate">{t(`theme.palettes.${p.key}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">{t("theme.colors")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {TOKENS.map((k) => (
            <ColorField
              key={k} id={`theme-${k}`} label={t(`theme.tokens.${k}`)} value={theme[k]} fallback={colors[k]}
              onChange={(hex) => { if (hex) onChange({ palette: "custom", [k]: hex }); }}
            />
          ))}
        </div>
        <ContrastBadges checks={checks} />
        <p className="text-xs text-muted-foreground">{t("theme.buttonNote")}</p>
        <Button
          type="button" variant="outline" size="sm" disabled={isTemplateColors && theme.palette === templateTheme.palette}
          onClick={() => onChange({ palette: templateTheme.palette, primary: tpl.primary, background: tpl.background, text: tpl.text, surface: tpl.surface })}
        >
          <RotateCcw />{t("colors.resetTemplate")}
        </Button>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="theme-font">{t("theme.font")}</Label>
        <select
          id="theme-font" value={theme.font} onChange={(e) => onChange({ font: e.target.value })}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{t("theme.fontHint")}</p>
      </div>

      <div className="space-y-4 rounded-lg border border-dashed p-3">
        <ImageUploadField id="theme-logo" label={t("theme.logo")} value={theme.logoUrl ?? ""} purpose="branding" onChange={(url) => onChange({ logoUrl: url })} />
        <ImageUploadField id="theme-favicon" label={t("theme.favicon")} value={theme.faviconUrl ?? ""} purpose="branding" onChange={(url) => onChange({ faviconUrl: url })} />
      </div>
    </div>
  );
}

function paletteColors(theme: PageTheme) {
  return resolveThemeColors(theme);
}
