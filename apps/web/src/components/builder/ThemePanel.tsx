"use client";

import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FONTS, HEX_RE, MIN_CONTRAST, PALETTES, primaryContrast } from "@/components/sections/theme";
import { isHttpsUrl } from "@/components/sections/safe-url";
import type { PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ThemePanel({ theme, onChange }: { theme: PageTheme; onChange: (patch: Partial<PageTheme>) => void }) {
  const t = useTranslations("builder");
  const validHex = HEX_RE.test(theme.primary);
  const ratio = primaryContrast(theme.primary);
  const lowContrast = validHex && ratio < MIN_CONTRAST;
  const urlField = (key: "logoUrl" | "faviconUrl", id: string, label: string) => {
    const v = theme[key] ?? "";
    const invalid = v !== "" && !isHttpsUrl(v);
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} type="url" inputMode="url" placeholder="https://" value={v} aria-invalid={invalid}
          onChange={(e) => onChange({ [key]: e.target.value.trim() })} />
        {invalid ? <p className="text-xs text-destructive">{t("editor.errors.httpsUrl")}</p> : null}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{t("theme.palette")}</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PALETTES.map((p) => (
            <label
              key={p.key}
              className={cn(
                "relative flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                theme.palette === p.key && "border-primary ring-2 ring-primary/30",
              )}
            >
              <input type="radio" name="palette" className="sr-only" checked={theme.palette === p.key}
                onChange={() => onChange({ palette: p.key, primary: p.primary })} />
              <span className="flex shrink-0">
                {[p.primary, p.surface, p.text].map((c) => <span key={c} className="size-4 border first:rounded-l last:rounded-r" style={{ backgroundColor: c }} aria-hidden />)}
              </span>
              <span className="truncate">{t(`theme.palettes.${p.key}`)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="theme-primary">{t("theme.primary")}</Label>
        <div className="flex items-center gap-2">
          <input
            type="color" aria-label={t("theme.primaryPicker")} value={validHex ? theme.primary : "#000000"}
            onChange={(e) => onChange({ primary: e.target.value })}
            className="size-8 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
          />
          <Input id="theme-primary" value={theme.primary} maxLength={7} className="font-mono" aria-invalid={!validHex || lowContrast}
            aria-describedby="theme-primary-hint" onChange={(e) => onChange({ primary: e.target.value.trim() })} />
        </div>
        <p id="theme-primary-hint" className={cn("flex items-start gap-1.5 text-xs", validHex && !lowContrast ? "text-muted-foreground" : "text-amber-800")} role="status">
          {!validHex ? t("theme.hexInvalid") : lowContrast ? (
            <><TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />{t("theme.contrastLow", { ratio: ratio.toFixed(2), min: MIN_CONTRAST })}</>
          ) : t("theme.contrastOk", { ratio: ratio.toFixed(2) })}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="theme-font">{t("theme.font")}</Label>
        <select id="theme-font" value={theme.font} onChange={(e) => onChange({ font: e.target.value })}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
          {FONTS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
        <p className="text-xs text-muted-foreground">{t("theme.fontHint")}</p>
      </div>

      <div className="space-y-3 rounded-lg border border-dashed p-3">
        {urlField("logoUrl", "theme-logo", t("theme.logo"))}
        {urlField("faviconUrl", "theme-favicon", t("theme.favicon"))}
        <p className="text-xs text-muted-foreground">{t("theme.uploadPlaceholder")}</p>
      </div>
    </div>
  );
}
