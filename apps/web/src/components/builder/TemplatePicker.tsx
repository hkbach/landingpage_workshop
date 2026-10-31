"use client";

import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, Eye } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import type { LayoutKey } from "@/lib/types";
import { TEMPLATE_KEYS, TEMPLATES, type TemplateDef, type TemplateKey } from "@/components/sections/templates";
import { findFont, findPalette, type Palette } from "@/components/sections/theme";
import { cn } from "@/lib/utils";

/** Layouts shown with an "easy start" tag (the most beginner-friendly, listed first). */
const EASY: ReadonlySet<TemplateKey> = new Set(["classic", "quicklinks", "bookingrail"]);

// Wireframe primitives. Colours come from the template palette; the corner radius from the CSS variable --wf-r and the
// default line colour from `currentColor`, so these stay plain components (no components created during render).
function Blk({ c, className, style }: { c: string; className?: string; style?: CSSProperties }) {
  return <div className={cn("rounded-[var(--wf-r)]", className)} style={{ backgroundColor: c, ...style }} />;
}
function Ln({ w = "100%", c, o = 0.45, h = 3 }: { w?: string; c?: string; o?: number; h?: number }) {
  return <div className="rounded-full" style={{ width: w, height: h, backgroundColor: c ?? "currentColor", opacity: o }} />;
}

function TopBar({ p }: { p: Palette }) {
  return (
    <div className="flex h-4 shrink-0 items-center gap-1.5 px-1.5" style={{ backgroundColor: p.background, borderBottom: `1px solid ${p.text}26` }}>
      <Blk c={p.primary} className="size-2" /><Ln w="14%" /><div className="flex-1" /><Ln w="9%" /><Ln w="9%" /><Blk c={p.primary} className="h-2 w-5" />
    </div>
  );
}
function HeroBlk({ p, h, start }: { p: Palette; h: string; start?: boolean }) {
  return (
    <div className={cn("flex flex-col justify-center gap-1 rounded-[var(--wf-r)] px-2", start ? "items-start" : "items-center")} style={{ height: h, backgroundColor: p.primary }}>
      <Ln w="55%" c="#fff" o={0.95} h={4} /><Ln w="35%" c="#fff" o={0.6} /><Blk c={p.background} className="mt-0.5 h-2 w-6" />
    </div>
  );
}
function Cards({ p, n, h }: { p: Palette; n: number; h: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: n }, (_, i) => (
        <Blk key={i} c={p.surface} className="flex-1" style={{ height: h, border: `1px solid ${p.text}26` }} />
      ))}
    </div>
  );
}
function TextRow({ p }: { p: Palette }) {
  return (
    <div className="flex items-center gap-2">
      <Blk c={p.surface} className="h-8 w-1/2" />
      <div className="flex flex-1 flex-col gap-1"><Ln /><Ln w="80%" /><Ln w="60%" /></div>
    </div>
  );
}

/**
 * CSS-drawn wireframe of a page layout: shows the page STRUCTURE (top bar, narrow column, sidebar, bento tiles, sticky
 * booking rail, tabs...) in the template's own colours. Purely decorative (aria-hidden); the card carries the text.
 */
export function LayoutWireframe({ layout, template }: { layout: LayoutKey; template: TemplateDef }) {
  const p = findPalette(template.theme.palette);
  const radius = template.theme.radius;
  const rad = radius === "none" ? 0 : radius === "sm" ? 2 : radius === "xl" ? 6 : 4;
  const border = `1px solid ${p.text}26`;
  const shadow = `0 2px 6px ${p.text}30`;
  let body: ReactNode;
  switch (layout) {
    case "classic":
      body = (
        <div className="flex h-full flex-col">
          <TopBar p={p} />
          <div className="flex flex-1 flex-col gap-1.5 p-1.5"><HeroBlk p={p} h="34%" /><TextRow p={p} /><Cards p={p} n={3} h={16} /></div>
        </div>
      );
      break;
    case "quicklinks":
      body = (
        <div className="flex h-full justify-center" style={{ backgroundColor: p.surface }}>
          <div className="flex h-full w-[46%] flex-col items-center gap-1.5 px-2 py-2" style={{ backgroundColor: p.background, boxShadow: `0 0 0 1px ${p.text}26` }}>
            <div className="size-6 rounded-full" style={{ backgroundColor: p.primary }} />
            <Ln w="55%" o={0.7} h={4} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex h-4 w-full items-center justify-between px-1.5" style={{ border: `1.5px solid ${p.primary}`, borderRadius: Math.max(rad, 6), backgroundColor: i === 0 ? p.primary : "transparent" }}>
                <Ln w="45%" c={i === 0 ? "#fff" : undefined} o={i === 0 ? 0.9 : 0.5} /><Ln w="6%" c={i === 0 ? "#fff" : undefined} o={0.5} />
              </div>
            ))}
          </div>
        </div>
      );
      break;
    case "sidebar":
      body = (
        <div className="flex h-full">
          <div className="flex w-[30%] flex-col gap-1.5 p-1.5" style={{ backgroundColor: p.surface, borderRight: border }}>
            <Blk c={p.primary} className="size-4" /><Ln w="70%" o={0.7} h={4} />
            {[0, 1, 2, 3].map((i) => <Ln key={i} w={`${85 - i * 8}%`} o={i === 0 ? 0.8 : 0.4} />)}
            <div className="flex-1" /><Blk c={p.primary} className="h-3 w-full" />
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-1.5"><HeroBlk p={p} h="36%" start /><TextRow p={p} /><Cards p={p} n={2} h={14} /></div>
        </div>
      );
      break;
    case "bento":
      body = (
        <div className="grid h-full grid-cols-4 grid-rows-3 gap-1 p-1.5">
          <Blk c={p.primary} className="col-span-2 row-span-2" />
          <Blk c={p.surface} className="col-span-2" style={{ border }} />
          <Blk c={p.text} style={{ opacity: 0.25 }} />
          <Blk c={p.surface} style={{ border }} />
          <Blk c={p.surface} className="col-span-2" style={{ border }} />
          <Blk c={p.text} style={{ opacity: 0.18 }} />
          <Blk c={p.primary} style={{ opacity: 0.55 }} />
        </div>
      );
      break;
    case "bookingrail":
      body = (
        <div className="flex h-full flex-col">
          <TopBar p={p} />
          <div className="flex flex-1 gap-1.5 p-1.5">
            <div className="flex flex-1 flex-col gap-1.5"><HeroBlk p={p} h="38%" start /><TextRow p={p} /><Cards p={p} n={2} h={12} /></div>
            <div className="flex w-[30%] flex-col gap-1.5 rounded-[var(--wf-r)] p-1.5" style={{ backgroundColor: p.surface, border, boxShadow: shadow }}>
              <Ln w="70%" o={0.7} h={4} />
              <Blk c={p.background} className="h-3 w-full" style={{ border }} />
              <Ln w="50%" /><div className="flex-1" /><Blk c={p.primary} className="h-3.5 w-full" />
            </div>
          </div>
        </div>
      );
      break;
    case "magazine":
      body = (
        <div className="flex h-full flex-col px-2 pt-1.5" style={{ fontFamily: findFont(template.theme.font).stack }}>
          <div className="flex items-center justify-between pb-1" style={{ borderBottom: `2px solid ${p.text}` }}><Ln w="28%" o={0.8} h={4} /><Ln w="16%" /></div>
          <div className="flex flex-1 items-center gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <span className="text-[22px] font-bold leading-[0.9]">Aa</span><Ln w="90%" h={4} o={0.8} /><Ln w="60%" h={4} o={0.8} /><Ln w="45%" />
            </div>
            <Blk c={p.primary} className="mt-3 h-12 w-[32%]" />
          </div>
          <div className="flex items-baseline gap-1.5 py-1" style={{ borderTop: `1px solid ${p.text}66` }}>
            <span className="text-[13px] font-bold leading-none" style={{ color: p.primary }}>01</span><Ln w="20%" /><div className="h-px flex-1" style={{ backgroundColor: `${p.text}26` }} />
          </div>
        </div>
      );
      break;
    case "cinematic":
      body = (
        <div className="relative flex h-full flex-col">
          <div className="flex flex-1 flex-col justify-center gap-1 px-3" style={{ backgroundImage: `linear-gradient(90deg, ${p.surface}, ${p.background})` }}>
            <Ln w="55%" o={0.95} h={6} /><Ln w="40%" o={0.5} /><Blk c={p.primary} className="mt-1 h-2.5 w-8" />
          </div>
          <div className="h-[22%] px-3 pt-1" style={{ backgroundColor: p.surface }}><Ln w="30%" o={0.7} h={4} /></div>
          <div className="absolute inset-y-0 right-1.5 flex flex-col items-center justify-center gap-1.5">
            {[0, 1, 2, 3].map((i) => <div key={i} className="size-1.5 rounded-full" style={{ backgroundColor: i === 0 ? p.primary : p.text, opacity: i === 0 ? 1 : 0.4 }} />)}
          </div>
        </div>
      );
      break;
    case "floatingcards":
      body = (
        <div className="flex h-full flex-col gap-1.5 p-1.5" style={{ backgroundColor: `${p.primary}26` }}>
          <div className="mx-2 flex h-4 items-center gap-1.5 rounded-full px-2" style={{ backgroundColor: p.background, boxShadow: shadow }}>
            <Blk c={p.primary} className="size-2 rounded-full" /><div className="flex-1" /><Ln w="14%" /><Blk c={p.primary} className="h-2 w-5 rounded-full" />
          </div>
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-1 flex-col justify-center gap-1 rounded-lg px-2" style={{ backgroundColor: p.background, boxShadow: `0 3px 8px ${p.text}30` }}>
              <Ln w="40%" c={p.primary} o={0.9} h={4} /><Ln w="85%" /><Ln w="65%" />
            </div>
          ))}
        </div>
      );
      break;
    case "journey":
      body = (
        <div className="relative flex h-full flex-col justify-around py-1.5 pl-1.5 pr-2">
          <div className="absolute bottom-3 top-3 w-px" style={{ left: 11, backgroundColor: p.primary, opacity: 0.5 }} />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="z-10 grid size-[18px] shrink-0 place-items-center rounded-full text-[8px] font-bold" style={{ backgroundColor: p.primary, color: "#fff" }}>{i + 1}</div>
              <div className="flex flex-1 flex-col gap-0.5 rounded-[var(--wf-r)] px-1.5 py-1" style={{ backgroundColor: p.surface, border }}><Ln w="35%" c={p.primary} o={0.9} /><Ln w="80%" /></div>
            </div>
          ))}
        </div>
      );
      break;
    case "appstyle":
      body = (
        <div className="flex h-full flex-col">
          <div className="flex h-4 items-center gap-1.5 px-1.5" style={{ backgroundColor: p.background, borderBottom: border }}><Blk c={p.primary} className="size-2" /><Ln w="20%" /></div>
          <div className="flex h-4 items-end" style={{ borderBottom: border }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-1 items-center justify-center pb-0.5" style={{ borderBottom: i === 0 ? `2px solid ${p.primary}` : "2px solid transparent" }}><Ln w="60%" o={i === 0 ? 0.9 : 0.35} /></div>
            ))}
          </div>
          <div className="flex flex-1 flex-col gap-1.5 p-1.5"><HeroBlk p={p} h="38%" /><TextRow p={p} /></div>
          <div className="flex h-5 items-center px-2" style={{ borderTop: border, backgroundColor: p.background }}><Blk c={p.primary} className="h-3 w-full" /></div>
        </div>
      );
      break;
  }
  return (
    <div
      aria-hidden className="h-36 overflow-hidden border"
      style={{ "--wf-r": `${rad}px`, backgroundColor: p.background, color: p.text, borderRadius: Math.max(rad, 3) } as CSSProperties}
    >
      {body}
    </div>
  );
}

/** Grid of the 10 templates: a wireframe of the page structure, friendly name, "Best for" line, palette dots, Preview. */
export function TemplatePicker({ current, onSelect }: { current: TemplateKey; onSelect: (key: TemplateKey) => void }) {
  const t = useTranslations("builder");
  return (
    <div role="radiogroup" aria-label={t("template.title")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {TEMPLATE_KEYS.map((k) => {
        const selected = current === k;
        const def = TEMPLATES[k];
        const p = findPalette(def.theme.palette);
        const name = t(`template.names.${k}`);
        return (
          <div
            key={k}
            className={cn(
              "relative flex flex-col gap-2 rounded-lg border p-2.5 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              selected ? "border-primary ring-2 ring-primary/30" : "hover:bg-muted/50",
            )}
          >
            <label className="flex cursor-pointer flex-col gap-2">
              <input
                type="radio" name="template" value={k} checked={selected} className="sr-only"
                onChange={() => { if (!selected) onSelect(k); }}
              />
              <LayoutWireframe layout={def.layout} template={def} />
              <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 font-medium">
                <span>{name}</span>
                <span className="flex items-center gap-1">
                  {EASY.has(k) ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t("template.easy")}</span> : null}
                  {selected ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
                      <Check className="size-3" aria-hidden />{t("template.current")}
                    </span>
                  ) : null}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">{t(`template.descriptions.${k}`)}</span>
            </label>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1" aria-hidden>
                {[p.primary, p.background, p.surface, p.text].map((c, i) => (
                  <span key={i} className="size-3.5 rounded-full border border-black/15" style={{ backgroundColor: c }} />
                ))}
              </span>
              <Link
                href={`/shopowner/site/preview?template=${k}`} aria-label={t("template.previewLabel", { name })}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                <Eye />{t("template.preview")}
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
