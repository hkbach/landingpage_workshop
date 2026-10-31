"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Clock, ExternalLink, Mail, MapPin, MessageCircle, Phone, Play } from "lucide-react";
import { isYoutubeId, MAX_SECTION_VIDEOS, youtubeEmbedUrl, youtubeThumbnailUrl } from "@workshop/shared";
import { cn } from "@/lib/utils";
import type { ContactProps, FaqProps, FooterProps, LocationProps, TestimonialsProps, VideoProps } from "./context";
import {
  arr, box, card, Heading, Img, linkClass, localizer, primaryButton, Section, Socials, str, type RenderProps,
} from "./renderer-kit";
import { useReportActions } from "./report-context";
import { safeMaps, telHref, whatsappHref } from "./safe-url";

// Section renderers (part 2): testimonials, faq, location, contact, video, footer.

export function TestimonialsSection({ section, props, ctx, variant }: RenderProps<TestimonialsProps>) {
  const L = localizer(ctx);
  const items = arr<TestimonialsProps["items"][number]>(props.items);
  if (items.length === 0) return null;
  if (variant === "quote") {
    return (
      <Section id={section.id} narrow>
        <Heading className="text-center">{L(props.heading)}</Heading>
        <ul className="space-y-10">
          {items.map((it, i) => (
            <li key={i}>
              <figure className="text-center">
                <span aria-hidden className="block text-5xl leading-none text-[var(--site-primary)]">&ldquo;</span>
                <blockquote className="whitespace-pre-line text-xl italic leading-relaxed text-[var(--site-text)] @xl:text-2xl">{L(it.text)}</blockquote>
                <figcaption className="mt-4 text-sm font-medium text-[var(--site-muted)]">
                  {str(it.name)}{it.country ? `, ${str(it.country)}` : ""}
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </Section>
    );
  }
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <ul className="grid gap-6 @3xl:grid-cols-2">
        {items.map((it, i) => (
          <li key={i}>
            <figure className={cn("h-full p-5", card)}>
              <blockquote className="whitespace-pre-line text-[var(--site-text)]">{L(it.text)}</blockquote>
              <figcaption className="mt-3 text-sm font-medium text-[var(--site-muted)]">
                {str(it.name)}{it.country ? `, ${str(it.country)}` : ""}
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </Section>
  );
}

export function FaqSection({ section, props, ctx, variant }: RenderProps<FaqProps>) {
  const L = localizer(ctx);
  const items = arr<FaqProps["items"][number]>(props.items);
  if (items.length === 0) return null;
  if (variant === "two-column") {
    return (
      <Section id={section.id}>
        <Heading>{L(props.heading)}</Heading>
        <dl className="grid gap-x-10 gap-y-8 @3xl:grid-cols-2">
          {items.map((it, i) => (
            <div key={i}>
              <dt className="font-semibold text-[var(--site-text)]">{L(it.q)}</dt>
              <dd className="mt-2 whitespace-pre-line text-[var(--site-muted)]">{L(it.a)}</dd>
            </div>
          ))}
        </dl>
      </Section>
    );
  }
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <div className="space-y-3">
        {items.map((it, i) => (
          // Native <details>: keyboard accessible without extra JS.
          <details key={i} className={cn("group p-4", card)}>
            <summary className="cursor-pointer font-medium text-[var(--site-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]">{L(it.q)}</summary>
            <p className="mt-3 whitespace-pre-line text-[var(--site-muted)]">{L(it.a)}</p>
          </details>
        ))}
      </div>
    </Section>
  );
}

export function LocationSection({ section, props, ctx, variant }: RenderProps<LocationProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const maps = safeMaps(props.mapsUrl);
  const address = L(props.address), hours = L(props.hours);
  if (variant === "card") {
    return (
      <Section id={section.id}>
        <Heading>{L(props.heading)}</Heading>
        <div className={cn("grid gap-6 p-6 @xl:grid-cols-2", card)}>
          {address ? <p className="flex gap-3 whitespace-pre-line"><MapPin className="mt-0.5 size-5 shrink-0 text-[var(--site-primary)]" aria-hidden />{address}</p> : null}
          {hours ? <p className="flex gap-3 whitespace-pre-line"><Clock className="mt-0.5 size-5 shrink-0 text-[var(--site-primary)]" aria-hidden />{hours}</p> : null}
          {maps ? (
            <a href={maps} target="_blank" rel="noopener noreferrer" className={cn(primaryButton, "w-fit @xl:col-span-2")}>
              {t("sections.openMap")}<ExternalLink className="size-4" aria-hidden />
            </a>
          ) : null}
        </div>
      </Section>
    );
  }
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <div className="space-y-3">
        {address ? <p className="flex gap-2 whitespace-pre-line"><MapPin className="mt-0.5 size-5 shrink-0" aria-hidden />{address}</p> : null}
        {hours ? <p className="flex gap-2 whitespace-pre-line"><Clock className="mt-0.5 size-5 shrink-0" aria-hidden />{hours}</p> : null}
        {maps ? (
          <a href={maps} target="_blank" rel="noopener noreferrer" className={cn(linkClass, "inline-flex items-center gap-1")}>
            {t("sections.openMap")}<ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </div>
    </Section>
  );
}

export function ContactSection({ section, props, ctx, variant }: RenderProps<ContactProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const phone = str(props.phone), wa = str(props.whatsapp), email = str(props.email);
  const waHref = wa ? whatsappHref(wa) : undefined;
  const mail = email ? `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}` : undefined;

  if (variant === "cards") {
    const tiles = [
      phone ? { key: "phone", icon: <Phone className="size-5" aria-hidden />, label: t("sections.phone"), value: phone, href: telHref(phone), external: false } : null,
      waHref ? { key: "wa", icon: <MessageCircle className="size-5" aria-hidden />, label: t("sections.whatsapp"), value: wa, href: waHref, external: true } : null,
      mail ? { key: "mail", icon: <Mail className="size-5" aria-hidden />, label: t("sections.email"), value: email, href: mail, external: false } : null,
    ].filter((x): x is NonNullable<typeof x> => x !== null);
    return (
      <Section id={section.id}>
        <Heading>{L(props.heading)}</Heading>
        <ul className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
          {tiles.map((x) => (
            <li key={x.key} className={cn("flex items-center gap-3 p-4", card)}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--site-primary)] text-[var(--site-primary-fg)]">{x.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm text-[var(--site-muted)]">{x.label}</span>
                {x.href ? (
                  <a href={x.href} {...(x.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className={cn(linkClass, "break-words")}>{x.value}</a>
                ) : <span className="break-words font-medium">{x.value}</span>}
              </span>
            </li>
          ))}
        </ul>
        <Socials items={props.socials} className="mt-6" />
      </Section>
    );
  }
  return (
    <Section id={section.id}>
      <Heading>{L(props.heading)}</Heading>
      <ul className="space-y-3">
        {phone ? (
          <li className="flex items-center gap-2"><Phone className="size-5" aria-hidden />
            {telHref(phone) ? <a href={telHref(phone)} className={linkClass}>{phone}</a> : <span>{phone}</span>}
          </li>
        ) : null}
        {waHref ? (
          <li className="flex items-center gap-2"><span className="font-medium">{t("sections.whatsapp")}</span>
            <a href={waHref} target="_blank" rel="noopener noreferrer" className={linkClass}>{wa}</a>
          </li>
        ) : null}
        {mail ? (
          <li className="flex items-center gap-2"><Mail className="size-5" aria-hidden />
            <a href={mail} className={linkClass}>{email}</a>
          </li>
        ) : null}
        <li><Socials items={props.socials} /></li>
      </ul>
    </Section>
  );
}

/**
 * Lazy YouTube facade: shows the thumbnail and a Play button. Only after the click is the single allowed iframe
 * (youtube-nocookie.com) mounted. The ID is re-validated here, so nothing but a valid ID can ever reach the URL.
 */
export function YoutubeFacade({ videoId, title }: { videoId: string; title: string }) {
  const t = useTranslations("site");
  const [playing, setPlaying] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    // The Play button disappears on click: move focus to the player so keyboard users keep their place.
    if (playing) frame.current?.focus();
  }, [playing]);
  if (!isYoutubeId(videoId)) return null;
  return (
    <div className={cn("relative aspect-video w-full overflow-hidden bg-black", box)}>
      {playing ? (
        <iframe
          ref={frame}
          src={youtubeEmbedUrl(videoId)}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 size-full border-0"
        />
      ) : (
        <button
          type="button" onClick={() => setPlaying(true)} aria-label={t("sections.playVideo", { title })}
          className="group absolute inset-0 outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-white"
        >
          <Img src={youtubeThumbnailUrl(videoId)} className="size-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/25 transition group-hover:bg-black/35">
            <span className="grid size-16 place-items-center rounded-full bg-white text-black shadow-lg">
              <Play className="size-7 translate-x-0.5 fill-current" aria-hidden />
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/** Grid columns for n videos: 1 -> one, 2 or 4 -> two, 3 or 5 -> two on medium and three on wide containers. */
function videoGridClass(n: number): string {
  if (n <= 1) return "grid-cols-1";
  if (n === 2 || n === 4) return "grid-cols-1 @3xl:grid-cols-2";
  return "grid-cols-1 @3xl:grid-cols-2 @5xl:grid-cols-3";
}

export function VideoSection({ section, props, ctx, variant }: RenderProps<VideoProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  // At most 5 valid, distinct-by-position IDs; empty editing slots and anything invalid are ignored.
  const ids = arr<unknown>(props.videos).filter((v): v is string => isYoutubeId(v)).slice(0, MAX_SECTION_VIDEOS);
  if (ids.length === 0) return null;
  const title = L(props.heading) || t("sections.videoTitle");
  const caption = L(props.caption);
  const label = (i: number) => (ids.length > 1 ? t("sections.videoItem", { title, n: i + 1, total: ids.length }) : title);
  if (variant === "split") {
    return (
      <Section id={section.id}>
        <div className="grid gap-8 @3xl:grid-cols-5 @3xl:items-center">
          <div className="grid gap-4 @3xl:col-span-3">
            {ids.map((id, i) => <YoutubeFacade key={`${id}-${i}`} videoId={id} title={label(i)} />)}
          </div>
          <div className="@3xl:col-span-2">
            <Heading className="mb-4">{L(props.heading)}</Heading>
            {caption ? <p className="whitespace-pre-line text-[var(--site-muted)]">{caption}</p> : null}
          </div>
        </div>
      </Section>
    );
  }
  return (
    <Section id={section.id}>
      <div className={cn("mx-auto", ids.length === 1 ? "max-w-4xl" : "max-w-6xl")}>
        <Heading className="text-center">{L(props.heading)}</Heading>
        <div className={cn("grid gap-6", videoGridClass(ids.length))}>
          {ids.map((id, i) => <YoutubeFacade key={`${id}-${i}`} videoId={id} title={label(i)} />)}
        </div>
        {caption ? <p className="mt-4 whitespace-pre-line text-center text-[var(--site-muted)]">{caption}</p> : null}
      </div>
    </Section>
  );
}

/**
 * "Report this site": opens the report popup where one exists (public site, builder preview). A modified click
 * (new tab, new window) and the case without JavaScript still go to the stand-alone report page.
 */
function ReportLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const { open } = useReportActions();
  return (
    <a
      href={href} className={className}
      {...(open ? { "aria-haspopup": "dialog" as const } : {})}
      onClick={open ? (e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        open();
      } : undefined}
    >
      {children}
    </a>
  );
}

export function FooterSection({ section, props, ctx, variant }: RenderProps<FooterProps>) {
  const L = localizer(ctx);
  const t = useTranslations("site");
  const centered = variant === "centered";
  const footerLink = "underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-text)]";
  return (
    <footer
      id={`s-${section.id}`}
      className={cn("bg-[var(--site-bg)] px-[var(--sec-px,1rem)] py-10 text-[var(--site-text)] @xl:px-[var(--sec-px,1.5rem)]", variant === "light" && "border-t border-[color:var(--site-border)]")}
    >
      <div className={cn("mx-auto flex w-full max-w-[var(--sec-max,64rem)] flex-col gap-4", centered && "items-center text-center")}>
        <p className="whitespace-pre-line text-sm">{L(props.text) || `© ${ctx.shop.name}`}</p>
        <Socials items={props.socials} className={cn("text-sm", centered && "justify-center")} linkClassName={footerLink} />
        <nav aria-label={t("footer.legal")} className={cn("flex flex-wrap gap-x-4 gap-y-2 text-sm", centered && "justify-center")}>
          <ReportLink href={ctx.reportHref} className={footerLink}>{t("footer.report")}</ReportLink>
          <a href={ctx.privacyHref} className={footerLink}>{t("footer.privacy")}</a>
        </nav>
      </div>
    </footer>
  );
}
