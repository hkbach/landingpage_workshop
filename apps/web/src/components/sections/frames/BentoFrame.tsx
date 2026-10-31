"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { WorkshopCard } from "../renderers";
import { Img } from "../renderer-kit";
import { sectionVarsFor } from "../SectionRenderer";
import {
  activeWorkshops, BookButton, Brand, Footer, FrameRoot, galleryImages, LanguageSwitch, Main, Sec, STICKY_TOP, type FrameProps,
} from "./kit";
import { planBento, type BentoSize, type BentoTile } from "./logic";

const VARS = { "--sec-px": "1.25rem", "--sec-max": "100%", "--site-pad": "1.5rem", "--hero-min-h": "22rem" } as CSSProperties;

// Column spans per tile size: 1 column on phones, 2 on tablets, 4 on desktop (container queries, so the preview frame
// and a real window behave the same).
const SIZE_CLASS: Record<BentoSize, string> = {
  xl: "@2xl:col-span-2 @5xl:row-span-2",
  wide: "@2xl:col-span-2",
  tall: "@5xl:row-span-2",
  sq: "",
};

const tileShell = "relative flex flex-col overflow-hidden rounded-[calc(var(--site-radius)+0.25rem)] border border-[color:var(--site-border)] bg-[var(--site-bg)] text-[var(--site-text)] @container";

/** Bento Grid: a grid of mixed-size tiles (hero, about, one tile per workshop and per photo, video, location, contact). */
export function BentoFrame({ body, footer, theme, ctx }: FrameProps) {
  const workshops = activeWorkshops(ctx);
  const gallery = body.find((s) => s.type === "gallery");
  const images = gallery ? galleryImages(gallery, ctx) : [];
  const tiles = planBento(body, { workshopCount: workshops.length, imageCount: images.length });

  function tile(t: BentoTile) {
    if (t.kind === "workshop") {
      const w = workshops[t.index]!;
      return (
        <div style={sectionVarsFor(t.section, theme)} className={cn(tileShell, "p-3")}>
          <ul className="flex flex-1 flex-col [&>li]:flex-1"><WorkshopCard w={w} ctx={ctx} horizontal={t.size === "wide"} /></ul>
        </div>
      );
    }
    if (t.kind === "image") {
      return (
        <div className={cn(tileShell, "min-h-48")}>
          <Img src={images[t.index]!} className="absolute inset-0 size-full object-cover" />
        </div>
      );
    }
    return <div className={cn(tileShell, "[&>[data-section]>*]:flex-1")}><Sec section={t.section} ctx={ctx} theme={theme} /></div>;
  }

  return (
    <FrameRoot style={VARS}>
      <header className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)] text-[var(--site-text)]", STICKY_TOP)}>
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-3 py-2">
          <Brand theme={theme} ctx={ctx} className="flex-1" />
          <LanguageSwitch ctx={ctx} />
          <BookButton />
        </div>
      </header>
      <Main className="mx-auto w-full max-w-7xl p-3">
        <div className="grid auto-rows-[minmax(11rem,auto)] grid-cols-1 gap-3 [grid-auto-flow:dense] @2xl:grid-cols-2 @5xl:grid-cols-4">
          {tiles.map((t) => <div key={t.key} className={cn("flex min-w-0 flex-col [&>*]:flex-1", SIZE_CLASS[t.size])}>{tile(t)}</div>)}
        </div>
      </Main>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
