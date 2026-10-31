"use client";

import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import type { Workshop } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBookingActions } from "./booking-context";
import type { AboutProps, GalleryProps, HeroProps, RenderContext, TeamProps, WorkshopsProps } from "./context";
import {
  arr, box, card, focusRing, Heading, imageOf, Img, localizer, primaryButton, Section, str, type RenderProps,
} from "./renderer-kit";

// Section renderers (part 1). Each renderer implements every layout variant declared in the registry.
// All shop text is rendered as plain text (React escapes it). Never use dangerouslySetInnerHTML here.
// Draft props can be partially invalid while editing, so every accessor is defensive.

export function HeroSection({ section, props, ctx, variant }: RenderProps<HeroProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const { open } = useBookingActions();
  const image = imageOf(ctx)(props.imageUrl);
  const title = L(props.title) || ctx.shop.name;
  const subtitle = L(props.subtitle);
  const cta = (
    <button type="button" onClick={() => open()} className={cn(primaryButton, "mt-8 px-6")}>
      {L(props.ctaText) || t("sections.bookCta")}
    </button>
  );
  const root = "relative isolate overflow-hidden bg-[var(--site-bg)] text-[var(--site-text)]";

  if (variant === "split") {
    return (
      <section id={`s-${section.id}`} className={root}>
        <div className={cn("mx-auto grid w-full max-w-5xl gap-8 px-4 py-[var(--site-pad)] sm:px-6", image && "md:grid-cols-2 md:items-center")}>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">{title}</h1>
            {subtitle ? <p className="mt-4 max-w-xl whitespace-pre-line text-base sm:text-lg">{subtitle}</p> : null}
            {cta}
          </div>
          {image ? <Img src={image} priority className={cn("aspect-[4/3] w-full object-cover shadow-lg", box)} /> : null}
        </div>
      </section>
    );
  }

  const left = variant === "overlay-left";
  return (
    <section id={`s-${section.id}`} className={cn(root, "flex min-h-[26rem] items-center sm:min-h-[32rem]")}>
      {image ? (
        <>
          <Img src={image} priority className="absolute inset-0 -z-20 size-full object-cover" />
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 -z-10",
              left ? "bg-[var(--site-bg)]/80 sm:bg-linear-to-r sm:from-[var(--site-bg)] sm:via-[var(--site-bg)]/85 sm:to-transparent" : "bg-[var(--site-bg)]/70",
            )}
          />
        </>
      ) : null}
      <div className={cn("mx-auto flex w-full max-w-5xl flex-col px-4 py-[var(--site-pad)] sm:px-6", left ? "items-start text-left" : "items-center text-center")}>
        <h1 className={cn("text-3xl font-bold tracking-tight sm:text-5xl", left ? "max-w-xl" : "max-w-3xl")}>{title}</h1>
        {subtitle ? <p className={cn("mt-4 whitespace-pre-line text-base sm:text-lg", left ? "max-w-md" : "max-w-xl")}>{subtitle}</p> : null}
        {cta}
      </div>
    </section>
  );
}

export function AboutSection({ section, props, ctx, variant }: RenderProps<AboutProps>) {
  const L = localizer(ctx);
  const image = imageOf(ctx)(props.imageUrl);
  const text = (
    <div>
      <Heading>{L(props.heading)}</Heading>
      <p className="whitespace-pre-line text-base leading-relaxed text-[var(--site-muted)]">{L(props.body)}</p>
    </div>
  );
  if (variant === "stacked") {
    return (
      <Section id={section.id} narrow>
        <div className="space-y-8 text-center">
          {image ? <Img src={image} className={cn("aspect-[16/9] w-full object-cover", box)} /> : null}
          <div className="[&_h2]:mb-4">{text}</div>
        </div>
      </Section>
    );
  }
  const imageEl = image ? <Img src={image} className={cn("aspect-[4/3] w-full object-cover", box)} /> : null;
  return (
    <Section id={section.id}>
      <div className={cn("grid gap-8", image && "md:grid-cols-2 md:items-center")}>
        {variant === "image-left" ? imageEl : null}
        {text}
        {variant === "image-right" ? imageEl : null}
      </div>
    </Section>
  );
}

function WorkshopCard({ w, ctx, horizontal, featured }: { w: Workshop; ctx: RenderContext; horizontal?: boolean; featured?: boolean }) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const { open } = useBookingActions();
  const cover = imageOf(ctx)(w.coverUrl);
  return (
    <li className={cn("overflow-hidden", card, horizontal && "sm:flex", featured && "sm:col-span-2 lg:col-span-3")}>
      {cover ? (
        <Img
          src={cover}
          className={cn("aspect-[3/2] w-full object-cover", horizontal && "sm:aspect-auto sm:w-64 sm:shrink-0", featured && "sm:aspect-auto sm:min-h-72 sm:w-1/2")}
        />
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-2 p-4", featured && "sm:justify-center sm:p-8")}>
        <h3 className={cn("font-semibold text-[var(--site-text)]", featured ? "text-2xl" : "text-lg")}>{L(w.title)}</h3>
        <p className="whitespace-pre-line text-sm text-[var(--site-muted)]">{L(w.shortDescription)}</p>
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--site-text)]">
          <span className="inline-flex items-center gap-1"><Clock className="size-4" aria-hidden />{t("sections.duration", { minutes: w.durationMinutes })}</span>
          <span className="font-semibold">{formatMoney(w.priceAmount, w.currency, ctx.locale)}</span>
          <span className="text-[var(--site-muted)]">{t("sections.perPerson")}</span>
        </p>
        <div className="mt-auto pt-3">
          <button type="button" className={primaryButton} onClick={() => open(w.id)} aria-label={t("sections.bookWorkshop", { title: L(w.title) })}>
            {t("sections.book")}
          </button>
        </div>
      </div>
    </li>
  );
}

export function WorkshopsSection({ section, props, ctx, variant }: RenderProps<WorkshopsProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const list = ctx.workshops.filter((w) => w.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      {list.length === 0 ? <p className="text-[var(--site-muted)]">{t("sections.noWorkshops")}</p> : null}
      <ul className={cn("grid gap-6", variant === "list" ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {list.map((w, i) => (
          <WorkshopCard key={w.id} w={w} ctx={ctx} horizontal={variant === "list" || (variant === "featured" && i === 0)} featured={variant === "featured" && i === 0} />
        ))}
      </ul>
    </Section>
  );
}

export function GallerySection({ section, props, ctx, variant }: RenderProps<GalleryProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const img = imageOf(ctx);
  const urls = arr<string>(props.imageUrls).map((u) => img(u)).filter((u): u is string => !!u).slice(0, 12);
  if (urls.length === 0) return null;

  let body;
  if (variant === "masonry") {
    body = (
      <ul className="columns-2 gap-3 sm:columns-3">
        {urls.map((u, i) => (
          <li key={`${u.slice(-24)}-${i}`} className="mb-3 break-inside-avoid"><Img src={u} className={cn("w-full object-cover", box)} /></li>
        ))}
      </ul>
    );
  } else if (variant === "strip") {
    // Horizontally scrollable strip; focusable so keyboard users can scroll it.
    body = (
      <ul
        tabIndex={0} role="list" aria-label={L(props.heading) || t("sections.galleryLabel")}
        className={cn("flex snap-x snap-mandatory gap-3 overflow-x-auto pb-3", focusRing, box)}
      >
        {urls.map((u, i) => (
          <li key={`${u.slice(-24)}-${i}`} className="w-64 shrink-0 snap-start sm:w-80"><Img src={u} className={cn("aspect-[4/3] w-full object-cover", box)} /></li>
        ))}
      </ul>
    );
  } else {
    body = (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {urls.map((u, i) => (
          <li key={`${u.slice(-24)}-${i}`}><Img src={u} className={cn("aspect-square w-full object-cover", box)} /></li>
        ))}
      </ul>
    );
  }
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      {body}
    </Section>
  );
}

export function TeamSection({ section, props, ctx, variant }: RenderProps<TeamProps>) {
  const L = localizer(ctx);
  const imgOf = imageOf(ctx);
  const members = arr<TeamProps["members"][number]>(props.members);
  if (members.length === 0) return null;
  const inline = variant === "inline";
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <ul className={cn("grid gap-6", inline ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {members.map((m, i) => {
          const img = imgOf(m.imageUrl);
          return (
            <li key={i} className={cn("flex gap-4", inline ? "items-center" : cn("p-4", card))}>
              {img ? <Img src={img} className={cn("shrink-0 rounded-full object-cover", inline ? "size-16" : "size-20")} /> : null}
              <div>
                <h3 className="font-semibold text-[var(--site-text)]">{str(m.name)}</h3>
                <p className="text-sm font-medium text-[var(--site-primary)]">{L(m.role)}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-[var(--site-muted)]">{L(m.bio)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
