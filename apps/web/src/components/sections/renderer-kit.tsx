"use client";

import type { ReactNode } from "react";
import { pickLocalized, type Locale, type Localized } from "@workshop/shared";
import type { SectionInstance } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { RenderContext, SocialLink } from "./context";
import { safeImage, safeLink } from "./safe-url";

// Frames tune the shell through CSS variables: --sec-px (side padding), --sec-max (content width), --site-pad (vertical).
// Shared building blocks of the section renderers. Colours, radius and spacing come only from CSS variables set by the
// page wrapper and (per section) by SectionRenderer; shop text is always rendered as plain text.

export interface RenderProps<P> { section: SectionInstance; props: P; ctx: RenderContext; variant: string }

export const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
export const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Localized text picker bound to the render context. */
export function localizer(ctx: RenderContext) {
  return (v: unknown): string => pickLocalized(v as Localized | undefined, ctx.locale as Locale, ctx.shop.defaultLocale);
}

/** Image URL validator bound to the render context (data: URLs only in the builder preview). */
export function imageOf(ctx: RenderContext) {
  return (v: unknown): string | undefined => safeImage(v, { allowDataImages: ctx.allowDataImages === true });
}

export function Img({ src, alt = "", className, priority }: { src: string; alt?: string; className?: string; priority?: boolean }) {
  return (
    // Remote shop images: plain <img> (no image optimiser configured for arbitrary hosts in the MVP mock).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt={alt} className={className} referrerPolicy="no-referrer"
      loading={priority ? "eager" : "lazy"} decoding="async" {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}

export const box = "rounded-[var(--site-radius)]";
export const card = "rounded-[var(--site-radius)] border border-[color:var(--site-border)] bg-[var(--site-card)]";
export const focusRing = "outline-none focus-visible:ring-4 focus-visible:ring-[var(--site-text)]/40";

export const primaryButton = cn(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-[var(--site-btn-radius)] bg-[var(--site-primary)] px-5 py-2 text-sm font-semibold text-[var(--site-primary-fg)] transition hover:opacity-90",
  focusRing,
);
export const linkClass =
  "font-medium text-[var(--site-primary)] underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]";

/** Standard section shell: own background, text colour and vertical rhythm. */
export function Section({ id, label, className, children, narrow }: {
  id: string; label?: string; className?: string; children: ReactNode; narrow?: boolean;
}) {
  return (
    <section
      id={`s-${id}`} aria-label={label}
      className={cn("bg-[var(--site-bg)] px-[var(--sec-px,1rem)] py-[var(--site-pad)] text-[var(--site-text)] @xl:px-[var(--sec-px,1.5rem)]", className)}
    >
      <div className={cn("mx-auto w-full", narrow ? "max-w-[min(var(--sec-max,48rem),48rem)]" : "max-w-[var(--sec-max,64rem)]")}>{children}</div>
    </section>
  );
}

export function Heading({ children, className }: { children: ReactNode; className?: string }) {
  return children ? <h2 className={cn("mb-8 text-2xl font-semibold tracking-tight text-[var(--site-text)] @xl:text-3xl", className)}>{children}</h2> : null;
}

export function Socials({ items, className, linkClassName }: { items: SocialLink[]; className?: string; linkClassName?: string }) {
  const valid = arr<SocialLink>(items).filter((s) => safeLink(s.url));
  if (valid.length === 0) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-2", className)}>
      {valid.map((s, i) => (
        <li key={i}>
          <a href={safeLink(s.url)} target="_blank" rel="noopener noreferrer nofollow" className={linkClassName ?? linkClass}>
            {str(s.label) || safeLink(s.url)}
          </a>
        </li>
      ))}
    </ul>
  );
}
