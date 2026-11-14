"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { AccountButtons, BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, onTabListKeyDown, Sec, STICKY_TOP, type FrameProps, HeaderMenu } from "./kit";
import { groupIntoTabs, tabForHash, type TabKey } from "./logic";

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
const tabId = (k: string) => `tab-${k}`;
const panelId = (k: string) => `tabpanel-${k}`;

/**
 * App Style: a sticky tab bar (Overview / Workshops / Gallery / Info, derived from the enabled sections) that shows one
 * group of sections at a time. All panels stay in the DOM (hidden), so nothing is lost for crawlers or the preview, and
 * hash links (#s-<section id>, #tab-<key>) reveal the tab that contains their target.
 */
export function AppStyleFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const tabs = useMemo(() => groupIntoTabs(body), [body]);
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash, () => "");
  const [picked, setPicked] = useState<{ key: TabKey; hash: string } | null>(null);
  const hashTab = tabForHash(tabs, hash);
  const keys = tabs.map((x) => x.key);
  // A click wins until the hash changes again; then the hash target decides.
  const wanted = picked && picked.hash === hash ? picked.key : hashTab ?? picked?.key ?? tabs[0]?.key;
  const active = keys.includes(wanted as TabKey) ? (wanted as TabKey) : tabs[0]?.key;
  const select = (key: string) => setPicked({ key: key as TabKey, hash });

  // The target of a hash link lives in a panel that was hidden: scroll to it once its tab is revealed.
  useEffect(() => {
    if (!hashTab) return;
    const id = hash.slice(1);
    const raf = requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView());
    return () => cancelAnimationFrame(raf);
  }, [hash, hashTab]);

  return (
    <FrameRoot className="bg-[var(--site-bg)] text-[var(--site-text)]">
      <div className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)]", STICKY_TOP)}>
        <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2 @xl:px-6">
          <Brand theme={theme} ctx={ctx} className="flex-1" />
          <AccountButtons ctx={ctx} className="hidden @3xl:flex" />
          <LanguageSwitch ctx={ctx} className="hidden @3xl:block" />
          <BookButton className="hidden @3xl:inline-flex" />
          {/* The tabs are this layout's own navigation; the menu keeps the languages (Book is in the bottom bar). */}
          <HeaderMenu items={[]} ctx={ctx} showBook={false} />
        </header>
        {tabs.length > 1 ? (
          <div
            role="tablist" aria-label={t("tabs.label")}
            onKeyDown={(e) => active && onTabListKeyDown(e, keys, active, select, tabId)}
            className="mx-auto flex w-full max-w-5xl gap-1 overflow-x-auto px-2 @xl:px-4"
          >
            {tabs.map((tab) => {
              const on = tab.key === active;
              return (
                <button
                  key={tab.key} id={tabId(tab.key)} type="button" role="tab" aria-selected={on} aria-controls={panelId(tab.key)}
                  tabIndex={on ? 0 : -1} onClick={() => select(tab.key)}
                  className={cn(
                    "min-h-12 flex-1 whitespace-nowrap border-b-4 px-2 text-sm @xl:px-4 outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--site-primary)]",
                    on ? "border-[var(--site-primary)] font-semibold text-[var(--site-text)]" : "border-transparent text-[var(--site-muted)] hover:text-[var(--site-text)]",
                  )}
                >
                  {t(`tabs.${tab.key}`)}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <Main>
        {tabs.map((tab) => (
          <div
            key={tab.key} id={panelId(tab.key)} role={tabs.length > 1 ? "tabpanel" : undefined}
            aria-labelledby={tabs.length > 1 ? tabId(tab.key) : undefined} hidden={tab.key !== active}
            className="motion-safe:animate-in motion-safe:fade-in motion-safe:duration-300"
          >
            {tab.sections.map((s) => <Sec key={s.id} section={s} ctx={ctx} theme={theme} />)}
          </div>
        ))}
      </Main>

      <div className="sticky bottom-0 z-30 border-t border-[color:var(--site-border)] bg-[var(--site-bg)] p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.08)] @3xl:hidden">
        <BookButton className="min-h-12 w-full text-base" />
      </div>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
