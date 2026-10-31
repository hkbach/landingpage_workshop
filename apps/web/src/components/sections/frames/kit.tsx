"use client";

import { useContext, useEffect, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { Workshop, PageTheme, SectionInstance } from "@/lib/types";
import { cn } from "@/lib/utils";
import { LOCALE_NAMES } from "@/components/site/locale-names";
import { useBookingActions } from "../booking-context";
import { SiteChromeContext } from "../chrome-context";
import type { RenderContext } from "../context";
import { arr, focusRing, Img, imageOf, primaryButton } from "../renderer-kit";
import { safeImage } from "../safe-url";
import { SectionRenderer } from "../SectionRenderer";
import type { NavItem } from "./logic";

// Building blocks shared by the page frames: landmarks, skip link, brand, language switch, Book button, anchor nav.
// Frames only decide structure and chrome; sections are always rendered through SectionRenderer (or, for tiles, from
// the same props), so content, colours and per-section overrides keep working in every layout.

export interface FrameProps {
  /** Enabled sections in page order, without the footer. */
  body: SectionInstance[];
  /** The mandatory footer (every frame renders it). */
  footer: SectionInstance;
  theme: PageTheme;
  ctx: RenderContext;
}

export const MAIN_ID = "site-main";

/** Sticky offset: the builder preview sits below the dashboard's sticky header, the public site at the top. */
export const STICKY_TOP = "top-[var(--site-top,0px)]";

export function FrameRoot({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const t = useTranslations("site");
  return (
    <div className={cn("relative [&_[id^='s-']]:scroll-mt-24", className)} style={style}>
      <a
        href={`#${MAIN_ID}`}
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-[var(--site-bg)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--site-text)] focus:ring-2 focus:ring-[var(--site-primary)]"
      >
        {t("nav.skip")}
      </a>
      {children}
    </div>
  );
}

export function Main({ children, className }: { children: ReactNode; className?: string }) {
  return <main id={MAIN_ID} tabIndex={-1} className={cn("outline-none", className)}>{children}</main>;
}

export function Sec({ section, ctx, theme }: { section: SectionInstance; ctx: RenderContext; theme: PageTheme }) {
  return <SectionRenderer section={section} ctx={ctx} theme={theme} />;
}

export function Footer({ footer, ctx, theme }: { footer: SectionInstance; ctx: RenderContext; theme: PageTheme }) {
  return <SectionRenderer section={footer} ctx={ctx} theme={theme} />;
}

export function Brand({ theme, ctx, className, logoClassName }: { theme: PageTheme; ctx: RenderContext; className?: string; logoClassName?: string }) {
  const logo = safeImage(theme.logoUrl, { allowDataImages: ctx.allowDataImages === true });
  const initial = Array.from(ctx.shop.name)[0]?.toUpperCase() ?? "";
  return (
    <span className={cn("flex min-w-0 items-center gap-2 font-semibold text-[var(--site-text)]", className)}>
      {logo ? (
        <Img src={logo} className={cn("size-8 shrink-0 rounded-md object-cover", logoClassName)} />
      ) : (
        <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-md bg-[var(--site-primary)] text-sm font-bold text-[var(--site-primary-fg)]", logoClassName)}>{initial}</span>
      )}
      <span className="truncate">{ctx.shop.name}</span>
    </span>
  );
}

export function LanguageSwitch({ ctx, className }: { ctx: RenderContext; className?: string }) {
  const t = useTranslations("site");
  const chrome = useContext(SiteChromeContext);
  const langs = ctx.languages ?? [];
  if (langs.length < 2) return null;
  return (
    <nav aria-label={t("header.language")} className={className}>
      <ul className="flex gap-0.5">
        {langs.map((l) => {
          const current = l.locale === ctx.locale;
          return (
            <li key={l.locale}>
              <a
                href={l.href} hrefLang={l.locale} lang={l.locale} aria-label={LOCALE_NAMES[l.locale]} aria-current={current ? "true" : undefined}
                onClick={chrome.onSelectLocale ? (e) => { e.preventDefault(); chrome.onSelectLocale?.(l.locale); } : undefined}
                className={cn(
                  "inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-2 text-xs font-semibold uppercase outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]",
                  current ? "bg-[var(--site-primary)] text-[var(--site-primary-fg)]" : "text-[var(--site-text)] hover:bg-[var(--site-surface)]",
                )}
              >
                {l.locale}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BookButton({ className, workshopId }: { className?: string; workshopId?: string }) {
  const t = useTranslations("site");
  const { open } = useBookingActions();
  return (
    <button type="button" onClick={() => open(workshopId)} className={cn(primaryButton, "min-h-10 px-4", className)}>
      {t("nav.book")}
    </button>
  );
}

export const navLinkClass = cn(
  "inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-[var(--site-text)] hover:bg-[var(--site-surface)]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]",
);

/** Anchor links to the visible sections; labels come from i18n (`site.nav.<type>`), never from shop text. */
export function NavLinks({ items, className, linkClassName, activeId, onNavigate }: {
  items: NavItem[]; className?: string; linkClassName?: string; activeId?: string | null; onNavigate?: () => void;
}) {
  const t = useTranslations("site");
  return (
    <ul className={className}>
      {items.map((it) => (
        <li key={it.id}>
          <a
            href={it.href} onClick={onNavigate} aria-current={activeId === it.id ? "location" : undefined}
            className={cn(linkClassName ?? navLinkClass, activeId === it.id && "bg-[var(--site-surface)] font-semibold")}
          >
            {t(`nav.${it.type}`)}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Id of the section currently crossing the middle of the viewport (null before hydration / without IntersectionObserver). */
export function useActiveSection(ids: string[]): string | null {
  const key = ids.join("|");
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const list = key ? key.split("|") : [];
    const els = list.map((id) => document.getElementById(`s-${id}`)).filter((e): e is HTMLElement => !!e);
    if (els.length === 0 || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => { for (const e of entries) if (e.isIntersecting) setActive(e.target.id.slice(2)); },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [key]);
  return active;
}

/** Roving-focus keyboard handling of a horizontal tablist (arrows, Home, End). */
export function onTabListKeyDown(e: KeyboardEvent<HTMLElement>, keys: string[], current: string, select: (key: string) => void, idOf: (key: string) => string) {
  const i = keys.indexOf(current);
  let next = -1;
  if (e.key === "ArrowRight") next = (i + 1) % keys.length;
  else if (e.key === "ArrowLeft") next = (i - 1 + keys.length) % keys.length;
  else if (e.key === "Home") next = 0;
  else if (e.key === "End") next = keys.length - 1;
  if (next < 0) return;
  e.preventDefault();
  const key = keys[next]!;
  select(key);
  document.getElementById(idOf(key))?.focus();
}

/** ACTIVE workshops in display order (the same list the workshops section renders). */
export function activeWorkshops(ctx: RenderContext): Workshop[] {
  return ctx.workshops.filter((w) => w.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Valid gallery image URLs of a gallery section (same rules as the section renderer). */
export function galleryImages(section: SectionInstance, ctx: RenderContext): string[] {
  const img = imageOf(ctx);
  return arr<string>(section.props.imageUrls).map((u) => img(u)).filter((u): u is string => !!u).slice(0, 12);
}

export { focusRing };
