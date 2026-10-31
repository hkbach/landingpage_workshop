"use client";

import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, STICKY_TOP, useActiveSection, type FrameProps,
} from "./kit";
import { navItems } from "./logic";
import { focusRing } from "../renderer-kit";

const VARS = { "--sec-max": "60rem" } as CSSProperties;
const sideLink = cn(
  "flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--site-text)] hover:bg-[var(--site-bg)]",
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]",
);

/** Side Menu: fixed left sidebar on desktop (content scrolls on the right); a top bar with a menu button on phones. */
export function SidebarFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const [open, setOpen] = useState(false);
  const items = navItems(body);
  const active = useActiveSection(items.map((i) => i.id));
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
  return (
    <FrameRoot style={VARS}>
      <div className="flex flex-col @4xl:flex-row">
        <header onKeyDown={onKey} className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)] text-[var(--site-text)] @4xl:hidden", STICKY_TOP)}>
          <div className="flex items-center gap-2 px-4 py-2">
            <Brand theme={theme} ctx={ctx} className="flex-1" />
            <LanguageSwitch ctx={ctx} />
            <button
              type="button" aria-expanded={open} aria-controls="site-menu" onClick={() => setOpen((o) => !o)}
              aria-label={open ? t("nav.closeMenu") : t("nav.openMenu")}
              className={cn("inline-flex size-11 items-center justify-center rounded-md hover:bg-[var(--site-surface)]", focusRing)}
            >
              {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
            </button>
          </div>
          <div id="site-menu" hidden={!open} className="border-t border-[color:var(--site-border)] px-4 pb-4 pt-2">
            <nav aria-label={t("nav.primary")}>
              <NavLinks items={items} className="grid gap-1" linkClassName={sideLink} onNavigate={() => setOpen(false)} />
            </nav>
            <BookButton className="mt-3 w-full" />
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
