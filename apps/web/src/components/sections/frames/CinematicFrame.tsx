"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, STICKY_TOP, useActiveSection, type FrameProps, HeaderMenu } from "./kit";
import { navItems, isRenderable } from "./logic";

const HERO_VARS = { "--hero-min-h": "100svh" } as CSSProperties;

/**
 * Cinematic: full-height panels with large type and a dot progress indicator on desktop. No scroll snapping: it traps
 * keyboard/touch users in tall panels (workshops, gallery), so the page always scrolls normally.
 */
export function CinematicFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const panels = body.filter(isRenderable);
  const nav = navItems(body);
  const dots = panels.map((s) => ({ id: s.id, type: s.type, href: `#s-${s.id}` }));
  const active = useActiveSection(dots.map((d) => d.id));
  const current = active ?? dots[0]?.id;
  return (
    <FrameRoot className="bg-[var(--site-bg)] text-[var(--site-text)]">
      <header className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)]/85 backdrop-blur", STICKY_TOP)}>
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-2 @xl:px-6">
          <Brand theme={theme} ctx={ctx} className="flex-1 @5xl:flex-none" />
          {nav.length > 0 ? (
            <nav aria-label={t("nav.primary")} className="hidden flex-1 @5xl:block">
              <NavLinks items={nav} className="flex flex-wrap justify-center gap-1" />
            </nav>
          ) : null}
          <div className="hidden items-center gap-2 @3xl:flex">
            <LanguageSwitch ctx={ctx} />
            <BookButton />
          </div>
          <HeaderMenu items={nav} ctx={ctx} />
        </div>
      </header>

      <nav aria-label={t("nav.progress")} className="pointer-events-none absolute inset-y-0 right-4 z-20 hidden @4xl:block">
        <ol className="pointer-events-auto sticky top-[calc(50svh+var(--site-top,0px)/2)] flex -translate-y-1/2 flex-col gap-3">
          {dots.map((d) => (
            <li key={d.id}>
              <a
                href={d.href} title={t(`nav.${d.type === "hero" ? "top" : d.type}`)} aria-label={t(`nav.${d.type === "hero" ? "top" : d.type}`)}
                aria-current={current === d.id ? "location" : undefined}
                className={cn(
                  "block size-3.5 rounded-full border-2 border-[var(--site-text)] outline-none transition-transform motion-reduce:transition-none focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]",
                  current === d.id ? "scale-125 bg-[var(--site-primary)] border-[var(--site-primary)]" : "bg-transparent hover:bg-[var(--site-text)]/40",
                )}
              />
            </li>
          ))}
        </ol>
      </nav>

      <Main>
        {panels.map((s) => (
          <div
            key={s.id}
            style={s.type === "hero" ? HERO_VARS : undefined}
            className={cn(
              "flex min-h-[70svh] flex-col @4xl:min-h-[100svh]",
              "[&>[data-section]>*]:flex-1 [&>[data-section]>section]:flex [&>[data-section]>section]:flex-col [&>[data-section]>section]:justify-center",
              "[&_h2]:text-4xl [&_h2]:font-bold [&_h2]:tracking-tight @3xl:[&_h2]:text-6xl [&_h1]:text-5xl @3xl:[&_h1]:text-7xl",
            )}
          >
            <Sec section={s} ctx={ctx} theme={theme} />
          </div>
        ))}
      </Main>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
