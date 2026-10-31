"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Clock } from "lucide-react";
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
  const ctaLabel = L(props.ctaText) || t("sections.bookCta");
  const cta = (extra?: string) => (
    <button type="button" onClick={() => open()} className={cn(primaryButton, "mt-8 px-6", extra)}>{ctaLabel}</button>
  );
  const root = "relative isolate overflow-hidden bg-[var(--site-bg)] text-[var(--site-text)]";
  const pad = "px-[var(--sec-px,1rem)] @xl:px-[var(--sec-px,1.5rem)]";

  if (variant === "compact") {
    // Links-in-bio style header: round avatar (hero image), name, tagline and one big button.
    return (
      <section id={`s-${section.id}`} className={cn(root, pad, "py-[var(--site-pad)]")}>
        <div className="mx-auto flex w-full max-w-[var(--sec-max,28rem)] flex-col items-center text-center">
          {image ? (
            <Img src={image} priority className="size-28 rounded-full object-cover ring-4 ring-[var(--site-primary)]" />
          ) : (
            <span aria-hidden className="grid size-28 place-items-center rounded-full bg-[var(--site-primary)] text-4xl font-semibold text-[var(--site-primary-fg)]">
              {Array.from(ctx.shop.name)[0]?.toUpperCase()}
            </span>
          )}
          <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-2 whitespace-pre-line text-base text-[var(--site-muted)]">{subtitle}</p> : null}
          {cta("mt-6 min-h-14 w-full text-base")}
        </div>
      </section>
    );
  }

  if (variant === "editorial") {
    // Magazine cover: oversized headline with an offset portrait image.
    return (
      <section id={`s-${section.id}`} className={cn(root, pad, "py-[var(--site-pad)]")}>
        <div className={cn("mx-auto grid w-full max-w-[var(--sec-max,64rem)] gap-10", image && "@3xl:grid-cols-12 @3xl:items-end")}>
          <div className={cn(image && "@3xl:col-span-7")}>
            <p className="mb-5 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--site-muted)]">{ctx.shop.name}</p>
            <h1 className="text-5xl font-bold leading-[0.98] tracking-tight @xl:text-7xl @5xl:text-8xl">{title}</h1>
            {subtitle ? <p className="mt-6 max-w-md whitespace-pre-line border-s-2 border-[var(--site-primary)] ps-4 text-lg italic text-[var(--site-muted)]">{subtitle}</p> : null}
            {cta()}
          </div>
          {image ? (
            <div className="@3xl:col-span-5 @3xl:translate-y-12">
              <Img src={image} priority className="aspect-[3/4] w-full object-cover shadow-xl" />
            </div>
          ) : null}
        </div>
      </section>
    );
  }

  if (variant === "split") {
    return (
      <section id={`s-${section.id}`} className={root}>
        <div className={cn("mx-auto grid w-full max-w-[var(--sec-max,64rem)] gap-8 py-[var(--site-pad)]", pad, image && "@3xl:grid-cols-2 @3xl:items-center")}>
          <div>
            <h1 className="text-3xl font-bold tracking-tight @xl:text-5xl">{title}</h1>
            {subtitle ? <p className="mt-4 max-w-xl whitespace-pre-line text-base @xl:text-lg">{subtitle}</p> : null}
            {cta()}
          </div>
          {image ? <Img src={image} priority className={cn("aspect-[4/3] w-full object-cover shadow-lg", box)} /> : null}
        </div>
      </section>
    );
  }

  const left = variant === "overlay-left";
  const full = variant === "fullscreen";
  return (
    <section id={`s-${section.id}`} className={cn(root, "flex min-h-[var(--hero-min-h,26rem)] @xl:min-h-[var(--hero-min-h,32rem)]", full ? "items-end" : "items-center")}>
      {image ? (
        <>
          <Img src={image} priority className="absolute inset-0 -z-20 size-full object-cover" />
          <div
            aria-hidden
            className={cn(
              "absolute inset-0 -z-10",
              full ? "bg-linear-to-t from-[var(--site-bg)] via-[var(--site-bg)]/60 to-[var(--site-bg)]/25" : left ? "bg-[var(--site-bg)]/80 @xl:bg-linear-to-r @xl:from-[var(--site-bg)] @xl:via-[var(--site-bg)]/85 @xl:to-transparent" : "bg-[var(--site-bg)]/70",
            )}
          />
        </>
      ) : null}
      <div className={cn("mx-auto flex w-full max-w-[var(--sec-max,64rem)] flex-col py-[var(--site-pad)]", pad, left || full ? "items-start text-left" : "items-center text-center")}>
        <h1 className={cn("text-3xl font-bold tracking-tight @xl:text-5xl", left ? "max-w-xl" : "max-w-3xl")}>{title}</h1>
        {subtitle ? <p className={cn("mt-4 whitespace-pre-line text-base @xl:text-lg", left ? "max-w-md" : "max-w-xl")}>{subtitle}</p> : null}
        {cta()}
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
      <div className={cn("grid gap-8", image && "@3xl:grid-cols-2 @3xl:items-center")}>
        {variant === "image-left" ? imageEl : null}
        {text}
        {variant === "image-right" ? imageEl : null}
      </div>
    </Section>
  );
}

export function WorkshopCard({ w, ctx, horizontal, featured }: { w: Workshop; ctx: RenderContext; horizontal?: boolean; featured?: boolean }) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const { open } = useBookingActions();
  const cover = imageOf(ctx)(w.coverUrl);
  return (
    <li className={cn("overflow-hidden", card, horizontal && "@xl:flex", featured && "@xl:col-span-2 @5xl:col-span-3")}>
      {cover ? (
        <Img
          src={cover}
          className={cn("aspect-[3/2] w-full object-cover", horizontal && "@xl:aspect-auto @xl:w-64 @xl:shrink-0", featured && "@xl:aspect-auto @xl:min-h-72 @xl:w-1/2")}
        />
      ) : null}
      <div className={cn("flex flex-1 flex-col gap-2 p-4", featured && "@xl:justify-center @xl:p-8")}>
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

/** Big stacked "link" row used by the compact workshops variant: the whole row opens the booking modal. */
function WorkshopLinkRow({ w, ctx }: { w: Workshop; ctx: RenderContext }) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const { open } = useBookingActions();
  const cover = imageOf(ctx)(w.coverUrl);
  return (
    <li>
      <button
        type="button" onClick={() => open(w.id)} aria-label={t("sections.bookWorkshop", { title: L(w.title) })}
        className={cn("flex min-h-20 w-full items-center gap-3 p-3 text-left transition hover:shadow-md", card, focusRing)}
      >
        {cover ? <Img src={cover} className={cn("size-16 shrink-0 object-cover", box)} /> : null}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-[var(--site-text)]">{L(w.title)}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-sm text-[var(--site-muted)]">
            <span className="inline-flex items-center gap-1"><Clock className="size-3.5" aria-hidden />{t("sections.duration", { minutes: w.durationMinutes })}</span>
            <span className="font-semibold text-[var(--site-text)]">{formatMoney(w.priceAmount, w.currency, ctx.locale)}</span>
          </span>
        </span>
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--site-primary)] text-[var(--site-primary-fg)]"><ChevronRight className="size-5" /></span>
      </button>
    </li>
  );
}

export function WorkshopsSection({ section, props, ctx, variant }: RenderProps<WorkshopsProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const list = ctx.workshops.filter((w) => w.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
  if (variant === "compact") {
    return (
      <Section id={section.id}>
        <Heading className="mb-5">{L(props.heading)}</Heading>
        {list.length === 0 ? <p className="text-[var(--site-muted)]">{t("sections.noWorkshops")}</p> : null}
        <ul className="grid gap-3">{list.map((w) => <WorkshopLinkRow key={w.id} w={w} ctx={ctx} />)}</ul>
      </Section>
    );
  }
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      {list.length === 0 ? <p className="text-[var(--site-muted)]">{t("sections.noWorkshops")}</p> : null}
      <ul className={cn("grid gap-6", variant === "list" ? "grid-cols-1" : "@xl:grid-cols-2 @5xl:grid-cols-3")}>
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
      <ul className="columns-2 gap-3 @xl:columns-3">
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
          <li key={`${u.slice(-24)}-${i}`} className="w-64 shrink-0 snap-start @xl:w-80"><Img src={u} className={cn("aspect-[4/3] w-full object-cover", box)} /></li>
        ))}
      </ul>
    );
  } else {
    body = (
      <ul className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @5xl:grid-cols-4">
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
      <ul className={cn("grid gap-6", inline ? "@xl:grid-cols-2" : "@xl:grid-cols-2 @5xl:grid-cols-3")}>
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
