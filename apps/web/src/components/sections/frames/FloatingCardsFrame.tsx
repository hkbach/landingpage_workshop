"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, type FrameProps, HeaderMenu } from "./kit";
import { navItems } from "./logic";

const VARS = { "--sec-px": "1.25rem", "--sec-max": "100%", "--site-pad": "clamp(2rem, 5vw, 3.5rem)" } as CSSProperties;
const card = "overflow-hidden rounded-[calc(var(--site-radius)+0.75rem)] shadow-xl ring-1 ring-black/5";

/** Floating Cards: tinted canvas, a floating header pill and every section as its own elevated rounded card. */
export function FloatingCardsFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const items = navItems(body);
  return (
    <FrameRoot className="bg-[color-mix(in_srgb,var(--site-primary)_14%,var(--site-bg))] pb-6" style={VARS}>
      <header
        className={cn(
          "sticky z-30 mx-auto mt-3 w-[min(100%-1.5rem,64rem)] rounded-[2rem] border border-[color:var(--site-border)] bg-[var(--site-bg)] px-4 py-2 text-[var(--site-text)] shadow-lg",
          "top-[calc(var(--site-top,0px)+0.75rem)]",
        )}
      >
        <div className="flex items-center gap-3">
          <Brand theme={theme} ctx={ctx} className="flex-1 @5xl:flex-none" />
          {items.length > 0 ? (
            <nav aria-label={t("nav.primary")} className="hidden flex-1 @5xl:block">
              <NavLinks items={items} className="flex flex-wrap justify-center gap-1" />
            </nav>
          ) : null}
          <div className="hidden items-center gap-2 @3xl:flex">
            <LanguageSwitch ctx={ctx} />
            <BookButton className="rounded-full" />
          </div>
          <HeaderMenu items={items} ctx={ctx} />
        </div>
      </header>
      <Main className="mx-auto mt-6 flex w-[min(100%-1.5rem,64rem)] flex-col gap-6">
        {body.map((s) => <div key={s.id} className={cn(card, "@container")}><Sec section={s} ctx={ctx} theme={theme} /></div>)}
      </Main>
      <div className={cn("mx-auto mt-6 w-[min(100%-1.5rem,64rem)]", card)}>
        <Footer footer={footer} ctx={ctx} theme={theme} />
      </div>
    </FrameRoot>
  );
}
