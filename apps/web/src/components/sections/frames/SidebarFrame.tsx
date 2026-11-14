"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AccountButtons, BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, STICKY_TOP, useActiveSection, type FrameProps, HeaderMenu } from "./kit";
import { navItems } from "./logic";

const VARS = { "--sec-max": "60rem" } as CSSProperties;
const sideLink = cn(
  "flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--site-text)] hover:bg-[var(--site-bg)]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]",
);

/** Side Menu: fixed left sidebar on desktop (content scrolls on the right); a top bar with a menu button on phones. */
export function SidebarFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const items = navItems(body);
  const active = useActiveSection(items.map((i) => i.id));
  return (
    <FrameRoot style={VARS}>
      <div className="flex flex-col @4xl:flex-row">
        <header className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)] text-[var(--site-text)] @4xl:hidden", STICKY_TOP)}>
          <div className="flex items-center gap-2 px-4 py-2">
            <Brand theme={theme} ctx={ctx} className="flex-1" />
            <HeaderMenu items={items} ctx={ctx} until="4xl" />
          </div>
        </header>

        <aside
          className={cn(
            "hidden w-64 shrink-0 flex-col gap-6 overflow-y-auto border-e border-[color:var(--site-border)] bg-[var(--site-surface)] p-6 text-[var(--site-text)] @4xl:sticky @4xl:flex",
            STICKY_TOP, "@4xl:h-[calc(100svh-var(--site-top,0px))]",
          )}
        >
          <Brand theme={theme} ctx={ctx} className="flex-col items-start gap-3 text-lg" logoClassName="size-16 text-2xl" />
          <nav aria-label={t("nav.primary")} className="flex-1">
            <NavLinks items={items} className="grid gap-1" linkClassName={sideLink} activeId={active} />
          </nav>
          <div className="space-y-3">
            <AccountButtons ctx={ctx} className="grid grid-cols-2" />
            <LanguageSwitch ctx={ctx} />
            <BookButton className="w-full" />
          </div>
        </aside>

        <div className="min-w-0 flex-1 @container">
          <Main>{body.map((s) => <Sec key={s.id} section={s} ctx={ctx} theme={theme} />)}</Main>
          <Footer footer={footer} ctx={ctx} theme={theme} />
        </div>
      </div>
    </FrameRoot>
  );
}
