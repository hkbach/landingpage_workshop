"use client";

import type { CSSProperties, ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { TEMPLATE_KEYS, TEMPLATES, type TemplateDef, type TemplateKey } from "@/components/sections/templates";
import { findFont, findPalette } from "@/components/sections/theme";
import { cn } from "@/lib/utils";

const RADIUS: Record<string, string> = { none: "0", sm: "2px", md: "3px", lg: "5px", xl: "8px" };

/** Small CSS-drawn preview of a template: its palette, corner style and the layout of its first sections. */
export function TemplateThumb({ template }: { template: TemplateDef }) {
  const p = findPalette(template.theme.palette);
  const r = RADIUS[template.theme.radius ?? "md"];
  const bar = (w: string, color = p.text, h = 3): ReactNode => (
    <div style={{ width: w, height: h, backgroundColor: color, opacity: 0.55, borderRadius: 1 }} />
  );
  const box = (extra: CSSProperties, color = p.surface): ReactNode => (
    <div style={{ backgroundColor: color, borderRadius: r, border: `1px solid ${p.text}22`, ...extra }} />
  );

  const section = (type: string, variant: string): ReactNode => {
    switch (type) {
      case "hero": {
        const text = (align: string) => (
          <div className="flex flex-col gap-1" style={{ alignItems: align }}>
            <div style={{ width: "60%", height: 4, backgroundColor: "#fff", opacity: 0.9 }} />
            {bar("40%", "#fff")}
            <div style={{ width: 14, height: 5, backgroundColor: p.background, borderRadius: r }} />
          </div>
        );
        return (
          <div className="flex h-12 items-center px-2" style={{ backgroundColor: p.primary }}>
            {variant === "split" ? <div className="grid w-full grid-cols-2 items-center gap-2">{text("flex-start")}{box({ height: 30 }, "#ffffff55")}</div>
              : <div className="w-full">{text(variant === "overlay-left" ? "flex-start" : "center")}</div>}
          </div>
        );
      }
      case "about":
        return variant === "stacked" ? (
          <div className="space-y-1 px-2">{box({ height: 10 })}{bar("70%")}</div>
        ) : (
          <div className={cn("grid grid-cols-2 items-center gap-2 px-2", variant === "image-right" && "[&>:first-child]:order-2")}>
            {box({ height: 16 })}<div className="space-y-1">{bar("90%")}{bar("70%")}{bar("80%")}</div>
          </div>
        );
      case "workshops":
        return variant === "list" ? (
          <div className="space-y-1 px-2">{[0, 1, 2].map((i) => <div key={i} className="flex gap-1">{box({ width: 10, height: 7 }, p.background)}<div className="flex-1 pt-0.5">{bar("70%")}</div></div>)}</div>
        ) : variant === "featured" ? (
          <div className="grid grid-cols-4 gap-1 px-2">{box({ height: 14, gridColumn: "span 4" }, p.background)}{[0, 1, 2, 3].map((i) => <div key={i}>{box({ height: 8 }, p.background)}</div>)}</div>
        ) : (
          <div className="grid grid-cols-3 gap-1 px-2">{[0, 1, 2].map((i) => <div key={i}>{box({ height: 16 }, p.background)}</div>)}</div>
        );
      case "gallery":
        return variant === "masonry" ? (
          <div className="flex gap-1 px-2">{[16, 10, 14].map((h, i) => <div key={i} className="flex-1">{box({ height: h })}</div>)}</div>
        ) : variant === "strip" ? (
          <div className="flex gap-1 overflow-hidden px-2">{[0, 1, 2].map((i) => <div key={i} className="w-1/3 shrink-0">{box({ height: 12 })}</div>)}</div>
        ) : (
          <div className="grid grid-cols-4 gap-1 px-2">{[0, 1, 2, 3].map((i) => <div key={i}>{box({ height: 10 })}</div>)}</div>
        );
      case "video":
        return <div className="px-2">{box({ height: 18 }, "#111")}</div>;
      case "testimonials":
        return variant === "quote" ? <div className="flex flex-col items-center gap-1 px-2">{bar("70%", p.primary, 4)}{bar("40%")}</div>
          : <div className="grid grid-cols-2 gap-1 px-2">{box({ height: 12 })}{box({ height: 12 })}</div>;
      default:
        return <div className="space-y-1 px-2">{bar("45%", p.primary, 4)}{bar("85%")}{bar("65%")}</div>;
    }
  };

  const shown = template.sections.filter((s) => s.enabled !== false && s.type !== "footer").slice(0, 4);
  const footer = template.sections.find((s) => s.type === "footer");
  return (
    <div
      aria-hidden className="flex h-32 flex-col gap-1.5 overflow-hidden border"
      style={{ backgroundColor: p.background, borderRadius: r, fontFamily: findFont(template.theme.font).stack }}
    >
      {shown.map((s, i) => <div key={`${s.type}-${i}`} className={i === 0 ? "" : "shrink-0"}>{section(s.type, s.variant)}</div>)}
      <div
        className={cn("mt-auto h-3", footer?.variant === "centered" && "flex items-center justify-center")}
        style={{ backgroundColor: footer?.variant === "light" ? p.surface : p.text }}
      />
    </div>
  );
}

/** Grid of the 10 templates: thumbnail, name, one-line description and the current selection marker. */
export function TemplatePicker({ current, onSelect }: { current: TemplateKey; onSelect: (key: TemplateKey) => void }) {
  const t = useTranslations("builder");
  return (
    <div role="radiogroup" aria-label={t("template.title")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {TEMPLATE_KEYS.map((k) => {
        const selected = current === k;
        return (
          <label
            key={k}
            className={cn(
              "relative flex cursor-pointer flex-col gap-2 rounded-lg border p-2.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              selected ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/50",
            )}
          >
            <input
              type="radio" name="template" value={k} checked={selected} className="sr-only"
              onChange={() => { if (!selected) onSelect(k); }}
            />
            <TemplateThumb template={TEMPLATES[k]} />
            <span className="flex items-center justify-between gap-2 font-medium">
              {t(`template.names.${k}`)}
              {selected ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                  <Check className="size-3" aria-hidden />{t("template.current")}
                </span>
              ) : null}
            </span>
            <span className="text-xs text-muted-foreground">{t(`template.descriptions.${k}`)}</span>
          </label>
        );
      })}
    </div>
  );
}
