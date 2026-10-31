"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Clock, ExternalLink, Mail, MapPin, Phone } from "lucide-react";
import { formatMoney, pickLocalized, type Localized } from "@workshop/shared";
import type { SectionInstance } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useBookingActions } from "./booking-context";
import type {
  AboutProps, ContactProps, FaqProps, FooterProps, GalleryProps, HeroProps, LocationProps, RenderContext,
  SocialLink, TeamProps, TestimonialsProps, WorkshopsProps,
} from "./context";
import { safeImage, safeLink, safeMaps, telHref, whatsappHref } from "./safe-url";

// All shop text is rendered as plain text (React escapes it). Never use dangerouslySetInnerHTML here.
// Draft props can be partially invalid while editing, so every accessor is defensive.

interface RenderProps<P> { section: SectionInstance; props: P; ctx: RenderContext }

const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

function useL(ctx: RenderContext) {
  return (v: unknown): string => pickLocalized(v as Localized | undefined, ctx.locale, ctx.shop.defaultLocale);
}

function Img({ src, alt = "", className, priority }: { src: string; alt?: string; className?: string; priority?: boolean }) {
  return (
    // Remote shop images: plain <img> (no image optimiser configured for arbitrary hosts in the MVP mock).
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src} alt={alt} className={className} referrerPolicy="no-referrer"
      loading={priority ? "eager" : "lazy"} decoding="async" {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}

function Wrap({ id, children, tone = "bg", label }: { id: string; children: ReactNode; tone?: "bg" | "surface"; label?: string }) {
  return (
    <section
      id={`s-${id}`} aria-label={label}
      className={cn("px-4 py-12 sm:px-6 sm:py-16", tone === "surface" ? "bg-[var(--site-surface)]" : "bg-[var(--site-bg)]")}
    >
      <div className="mx-auto w-full max-w-5xl">{children}</div>
    </section>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return children ? <h2 className="mb-8 text-2xl font-semibold tracking-tight text-[var(--site-text)] sm:text-3xl">{children}</h2> : null;
}

const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[var(--site-primary)] px-5 py-2 text-sm font-semibold text-[var(--site-primary-fg)] outline-none transition hover:opacity-90 focus-visible:ring-4 focus-visible:ring-[var(--site-primary)]/40";
const linkClass = "font-medium text-[var(--site-primary)] underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]";

export function HeroSection({ section, props, ctx }: RenderProps<HeroProps>) {
  const L = useL(ctx);
  const t = useTranslations("site");
  const { open } = useBookingActions();
  const image = safeImage(props.imageUrl);
  return (
    <section id={`s-${section.id}`} className="relative isolate flex min-h-[26rem] items-center overflow-hidden bg-[var(--site-primary)] text-white sm:min-h-[32rem]">
      {image ? (
        <>
          <Img src={image} priority className="absolute inset-0 -z-20 size-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-black/60" aria-hidden />
        </>
      ) : null}
      <div className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6">
        <h1 className="max-w-2xl text-3xl font-bold tracking-tight sm:text-5xl">{L(props.title) || ctx.shop.name}</h1>
        {L(props.subtitle) ? <p className="mt-4 max-w-xl whitespace-pre-line text-base text-white sm:text-lg">{L(props.subtitle)}</p> : null}
        <button
          type="button" onClick={() => open()}
          className="mt-8 inline-flex min-h-11 items-center justify-center rounded-lg bg-white px-6 py-2 text-sm font-semibold text-[var(--site-primary)] outline-none transition hover:bg-white/90 focus-visible:ring-4 focus-visible:ring-white/60"
        >
          {L(props.ctaText) || t("sections.bookCta")}
        </button>
      </div>
    </section>
  );
}

export function AboutSection({ section, props, ctx }: RenderProps<AboutProps>) {
  const L = useL(ctx);
  const image = safeImage(props.imageUrl);
  return (
    <Wrap id={section.id}>
      <div className={cn("grid gap-8", image && "md:grid-cols-2 md:items-center")}>
        <div>
          <Heading>{L(props.heading)}</Heading>
          <p className="whitespace-pre-line text-base leading-relaxed text-[var(--site-muted)]">{L(props.body)}</p>
        </div>
        {image ? <Img src={image} className="aspect-[4/3] w-full rounded-xl object-cover" /> : null}
      </div>
    </Wrap>
  );
}

export function WorkshopsSection({ section, props, ctx }: RenderProps<WorkshopsProps>) {
  const L = useL(ctx);
  const t = useTranslations("site");
  const { open } = useBookingActions();
  const list = ctx.workshops.filter((w) => w.status === "ACTIVE").sort((a, b) => a.sortOrder - b.sortOrder);
  const isList = props.layout === "list";
  return (
    <Wrap id={section.id} tone="surface">
      <Heading>{L(props.heading)}</Heading>
      {list.length === 0 ? <p className="text-[var(--site-muted)]">{t("sections.noWorkshops")}</p> : null}
      <ul className={cn("grid gap-6", isList ? "grid-cols-1" : "sm:grid-cols-2 lg:grid-cols-3")}>
        {list.map((w) => {
          const cover = safeImage(w.coverUrl);
          return (
            <li key={w.id} className={cn("overflow-hidden rounded-xl border border-black/10 bg-white", isList && "sm:flex")}>
              {cover ? <Img src={cover} className={cn("aspect-[3/2] w-full object-cover", isList && "sm:aspect-auto sm:w-64 sm:shrink-0")} /> : null}
              <div className="flex flex-1 flex-col gap-2 p-4">
                <h3 className="text-lg font-semibold text-[var(--site-text)]">{L(w.title)}</h3>
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
        })}
      </ul>
    </Wrap>
  );
}

export function GallerySection({ section, props, ctx }: RenderProps<GalleryProps>) {
  const L = useL(ctx);
  const urls = arr<string>(props.imageUrls).map(safeImage).filter((u): u is string => !!u).slice(0, 12);
  if (urls.length === 0) return null;
  return (
    <Wrap id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {urls.map((u, i) => (
          <li key={`${u}-${i}`}><Img src={u} className="aspect-square w-full rounded-lg object-cover" /></li>
        ))}
      </ul>
    </Wrap>
  );
}

export function TeamSection({ section, props, ctx }: RenderProps<TeamProps>) {
  const L = useL(ctx);
  const members = arr<TeamProps["members"][number]>(props.members);
  if (members.length === 0) return null;
  return (
    <Wrap id={section.id} tone="surface">
      <Heading>{L(props.heading)}</Heading>
      <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {members.map((m, i) => {
          const img = safeImage(m.imageUrl);
          return (
            <li key={i} className="flex gap-4 rounded-xl border border-black/10 bg-white p-4">
              {img ? <Img src={img} className="size-20 shrink-0 rounded-full object-cover" /> : null}
              <div>
                <h3 className="font-semibold text-[var(--site-text)]">{str(m.name)}</h3>
                <p className="text-sm font-medium text-[var(--site-primary)]">{L(m.role)}</p>
                <p className="mt-1 whitespace-pre-line text-sm text-[var(--site-muted)]">{L(m.bio)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Wrap>
  );
}

export function TestimonialsSection({ section, props, ctx }: RenderProps<TestimonialsProps>) {
  const L = useL(ctx);
  const items = arr<TestimonialsProps["items"][number]>(props.items);
  if (items.length === 0) return null;
  return (
    <Wrap id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <ul className="grid gap-6 md:grid-cols-2">
        {items.map((it, i) => (
          <li key={i}>
            <figure className="h-full rounded-xl border border-black/10 bg-white p-5">
              <blockquote className="whitespace-pre-line text-[var(--site-text)]">{L(it.text)}</blockquote>
              <figcaption className="mt-3 text-sm font-medium text-[var(--site-muted)]">
                {str(it.name)}{it.country ? `, ${str(it.country)}` : ""}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Wrap>
  );
}

export function FaqSection({ section, props, ctx }: RenderProps<FaqProps>) {
  const L = useL(ctx);
  const items = arr<FaqProps["items"][number]>(props.items);
  if (items.length === 0) return null;
  return (
    <Wrap id={section.id} tone="surface">
      <Heading>{L(props.heading)}</Heading>
      <div className="space-y-3">
        {items.map((it, i) => (
          // Native <details>: keyboard accessible without extra JS.
          <details key={i} className="group rounded-lg border border-black/10 bg-white p-4">
            <summary className="cursor-pointer font-medium text-[var(--site-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]">{L(it.q)}</summary>
            <p className="mt-3 whitespace-pre-line text-[var(--site-muted)]">{L(it.a)}</p>
          </details>
        ))}
      </div>
    </Wrap>
  );
}

export function LocationSection({ section, props, ctx }: RenderProps<LocationProps>) {
  const L = useL(ctx);
  const t = useTranslations("site");
  const maps = safeMaps(props.mapsUrl);
  return (
    <Wrap id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <div className="space-y-3 text-[var(--site-text)]">
        {L(props.address) ? <p className="flex gap-2 whitespace-pre-line"><MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />{L(props.address)}</p> : null}
        {L(props.hours) ? <p className="flex gap-2 whitespace-pre-line"><Clock className="mt-0.5 size-5 shrink-0" aria-hidden />{L(props.hours)}</p> : null}
        {maps ? (
          <a href={maps} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "inline-flex items-center gap-1")}>
            {t("sections.openMap")}<ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </div>
    </Wrap>
  );
}

function Socials({ items }: { items: SocialLink[] }) {
  const valid = arr<SocialLink>(items).filter((s) => safeLink(s.url));
  if (valid.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {valid.map((s, i) => (
        <li key={i}>
          <a href={safeLink(s.url)} target="_blank" rel="noopener noreferrer nofollow" className={linkClass}>{str(s.label) || safeLink(s.url)}</a>
        </li>
      ))}
    </ul>
  );
}

export function ContactSection({ section, props, ctx }: RenderProps<ContactProps>) {
  const L = useL(ctx);
  const t = useTranslations("site");
  const phone = str(props.phone), wa = str(props.whatsapp), email = str(props.email);
  return (
    <Wrap id={section.id} tone="surface">
      <Heading>{L(props.heading)}</Heading>
      <ul className="space-y-3 text-[var(--site-text)]">
        {phone ? (
          <li className="flex items-center gap-2"><Phone className="size-5" aria-hidden />
            {telHref(phone) ? <a href={telHref(phone)} className={linkClass}>{phone}</a> : <span>{phone}</span>}
          </li>
        ) : null}
        {wa && whatsappHref(wa) ? (
          <li className="flex items-center gap-2"><span className="font-medium">{t("sections.whatsapp")}</span>
            <a href={whatsappHref(wa)} target="_blank" rel="noopener noreferrer" className={linkClass}>{wa}</a>
          </li>
        ) : null}
        {email ? (
          <li className="flex items-center gap-2"><Mail className="size-5" aria-hidden />
            <a href={`mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`} className={linkClass}>{email}</a>
          </li>
        ) : null}
        <li><Socials items={props.socials} /></li>
      </ul>
    </Wrap>
  );
}

export function FooterSection({ section, props, ctx }: RenderProps<FooterProps>) {
  const L = useL(ctx);
  const t = useTranslations("site");
  return (
    <footer id={`s-${section.id}`} className="bg-[var(--site-text)] px-4 py-10 text-white sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
        <p className="whitespace-pre-line text-sm">{L(props.text) || `© ${ctx.shop.name}`}</p>
        <div className="[&_a]:!text-white">
          <Socials items={props.socials} />
        </div>
        <nav aria-label={t("footer.legal")} className="flex flex-wrap gap-x-4 gap-y-2 text-sm [&_a]:text-white [&_a]:underline [&_a]:underline-offset-4">
          <a href={ctx.reportHref}>{t("footer.report")}</a>
          <a href={ctx.privacyHref}>{t("footer.privacy")}</a>
        </nav>
      </div>
    </footer>
  );
}
