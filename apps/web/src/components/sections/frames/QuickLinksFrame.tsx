"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Brand, Footer, FrameRoot, LanguageSwitch, Main, Sec, type FrameProps } from "./kit";
import { navItems } from "./logic";

const VARS = { "--sec-px": "1.25rem", "--sec-max": "100%", "--site-pad": "2rem" } as CSSProperties;

/** Quick Links: one narrow centred column (max 30rem, even on desktop) of big buttons and cards. Mobile first. */
export function QuickLinksFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const hero = body.find((s) => s.type === "hero");
  const rest = body.filter((s) => s !== hero);
  const items = navItems(body);
  return (
    <FrameRoot className="bg-[var(--site-surface)]" style={VARS}>
      <div className="mx-auto flex min-h-screen w-full max-w-[30rem] flex-col bg-[var(--site-bg)] text-[var(--site-text)] shadow-xl @container">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          {hero ? <span /> : <Brand theme={theme} ctx={ctx} />}
          <LanguageSwitch ctx={ctx} />
        </div>
        <Main className="flex-1">
          {hero ? <Sec section={hero} ctx={ctx} theme={theme} /> : null}
          {items.length > 0 ? (
            <nav aria-label={t("nav.primary")} className="px-5 pb-5">
              <ul className="grid gap-3">
                {items.map((it) => (
                  <li key={it.id}>
                    <a
                      href={it.href}
                      className={cn(
                        "flex min-h-14 items-center justify-between gap-3 rounded-[var(--site-btn-radius)] border-2 border-[var(--site-primary)] px-5 text-base font-semibold text-[var(--site-text)] transition",
                        "hover:bg-[var(--site-primary)] hover:text-[var(--site-primary-fg)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--site-text)]/40",
                      )}
                    >
                      {t(`nav.${it.type}`)}
                      <ChevronRight className="size-5" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
          <div className="grid gap-4 px-3 pb-6">
            {rest.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-[var(--site-radius)] border border-[color:var(--site-border)]">
                <Sec section={s} ctx={ctx} theme={theme} />
              </div>
            ))}
          </div>
        </Main>
        <Footer footer={footer} ctx={ctx} theme={theme} />
      </div>
    </FrameRoot>
  );
}
