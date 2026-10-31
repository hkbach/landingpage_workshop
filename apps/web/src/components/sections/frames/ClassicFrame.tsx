"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, STICKY_TOP, type FrameProps } from "./kit";
import { navItems } from "./logic";

/** Classic Story: sticky top bar (logo, anchor links, language, Book) and the familiar stack of full-width sections. */
export function ClassicFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const items = navItems(body);
  return (
    <FrameRoot>
      <header className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)] text-[var(--site-text)]", STICKY_TOP)}>
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 @xl:px-6">
          <Brand theme={theme} ctx={ctx} />
          {items.length > 0 ? (
            <nav
              aria-label={t("nav.primary")}
              className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 @3xl:order-none @3xl:mx-0 @3xl:w-auto @3xl:flex-1 @3xl:overflow-visible @3xl:px-0"
            >
              <NavLinks items={items} className="flex gap-1 whitespace-nowrap @3xl:flex-wrap" />
            </nav>
          ) : <span className="flex-1" />}
          <div className="ms-auto flex items-center gap-2 @3xl:ms-0">
            <LanguageSwitch ctx={ctx} />
            <BookButton />
          </div>
        </div>
      </header>
      <Main>
        {body.map((s) => <Sec key={s.id} section={s} ctx={ctx} theme={theme} />)}
      </Main>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
