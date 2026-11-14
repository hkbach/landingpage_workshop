"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AccountButtons, BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, type FrameProps, HeaderMenu } from "./kit";
import { chapterNumber, navItems } from "./logic";

const chapterLink = cn(
  "inline-flex min-h-10 items-center px-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--site-text)] hover:underline underline-offset-8",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]",
);

/** Magazine: editorial masthead, a cover hero, numbered chapters separated by thin rules, oversized serif headings. */
export function MagazineFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const items = navItems(body);
  const hero = body.find((s) => s.type === "hero");
  const chapters = body.filter((s) => s !== hero && items.some((i) => i.id === s.id));
  return (
    <FrameRoot className="bg-[var(--site-bg)] text-[var(--site-text)]">
      <header className="relative z-30 border-b-2 border-[var(--site-text)]">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-3 px-4 py-4 @xl:px-6">
          <Brand theme={theme} ctx={ctx} className="flex-1 font-serif text-lg uppercase tracking-[0.2em] @xl:text-2xl" />
          <div className="hidden items-center gap-2 @3xl:flex">
            <AccountButtons ctx={ctx} />
            <LanguageSwitch ctx={ctx} />
            <BookButton />
          </div>
          <HeaderMenu items={items} ctx={ctx} />
        </div>
      </header>
      {items.length > 0 ? (
        <nav aria-label={t("nav.primary")} className="hidden border-b border-[color:var(--site-border)] @3xl:block">
          <NavLinks items={items} linkClassName={chapterLink} className="mx-auto flex w-full max-w-6xl justify-start gap-1 overflow-x-auto px-3 whitespace-nowrap @3xl:justify-center" />
        </nav>
      ) : null}
      <Main>
        {hero ? <Sec section={hero} ctx={ctx} theme={theme} /> : null}
        {chapters.map((s, i) => (
          <div
            key={s.id}
            className={cn(
              "border-t border-[var(--site-text)]/40 pt-8",
              "[&_h2]:font-bold [&_h2]:leading-[1.02] [&_h2]:tracking-tight [&_h2]:text-4xl @3xl:[&_h2]:text-6xl",
              s.type === "testimonials" && "[&_blockquote]:font-serif [&_blockquote]:text-3xl @3xl:[&_blockquote]:text-4xl",
            )}
          >
            <div className="mx-auto flex w-full max-w-6xl items-baseline gap-4 px-4 @xl:px-6">
              <span aria-hidden className="font-serif text-5xl font-bold tabular-nums text-[var(--site-primary)] @3xl:text-7xl">{chapterNumber(i)}</span>
              <span className="text-xs font-semibold uppercase tracking-[0.3em]">{t(`nav.${s.type}`)}</span>
              <span aria-hidden className="h-px flex-1 bg-[var(--site-text)]/30" />
            </div>
            <Sec section={s} ctx={ctx} theme={theme} />
          </div>
        ))}
      </Main>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
