"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, STICKY_TOP, type FrameProps, HeaderMenu } from "./kit";
import { navItems } from "./logic";

/** Classic Story: sticky top bar (logo, anchor links, language, Book) and the familiar stack of full-width sections. */
export function ClassicFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const items = navItems(body);
  return (
    <FrameRoot>
      <header className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)] text-[var(--site-text)]", STICKY_TOP)}>
        <div className="mx-auto flex w-full max-w-6xl items-center gap-x-4 px-4 py-2 @xl:px-6">
          <Brand theme={theme} ctx={ctx} className="flex-1 @3xl:flex-none" />
          {items.length > 0 ? (
            <nav aria-label={t("nav.primary")} className="hidden @3xl:block @3xl:flex-1">
              <NavLinks items={items} className="flex flex-wrap gap-1" />
            </nav>
          ) : <span className="hidden flex-1 @3xl:block" />}
          <div className="hidden items-center gap-2 @3xl:flex">
            <LanguageSwitch ctx={ctx} />
            <BookButton />
          </div>
          <HeaderMenu items={items} ctx={ctx} />
        </div>
      </header>
      <Main>
        {body.map((s) => <Sec key={s.id} section={s} ctx={ctx} theme={theme} />)}
      </Main>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
