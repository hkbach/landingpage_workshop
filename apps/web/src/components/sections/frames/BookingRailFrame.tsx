"use client";

import { useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import { formatMoney } from "@workshop/shared";
import { cn } from "@/lib/utils";
import { useBookingActions } from "../booking-context";
import { localizer, primaryButton } from "../renderer-kit";
import type { RenderContext } from "../context";
import {
  activeWorkshops, BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, NavLinks, Sec, STICKY_TOP, type FrameProps,
} from "./kit";
import { navItems } from "./logic";

const VARS = { "--sec-px": "1.25rem", "--sec-max": "100%" } as CSSProperties;

function useSelection(ctx: RenderContext) {
  const list = activeWorkshops(ctx);
  const [picked, setPicked] = useState<string>("");
  const selected = list.find((w) => w.id === picked) ?? list[0];
  return { list, selected, setPicked };
}

/** Book Now Rail: content on the left, a sticky booking card on the right (a sticky bottom bar on phones). */
export function BookingRailFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const L = localizer(ctx);
  const { open } = useBookingActions();
  const { list, selected, setPicked } = useSelection(ctx);
  const items = navItems(body);
  const price = selected ? formatMoney(selected.priceAmount, selected.currency, ctx.locale) : "";

  return (
    <FrameRoot style={VARS}>
      <header className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)] text-[var(--site-text)]", STICKY_TOP)}>
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 @xl:px-6">
          <Brand theme={theme} ctx={ctx} />
          {items.length > 0 ? (
            <nav aria-label={t("nav.primary")} className="order-last -mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 @5xl:order-none @5xl:mx-0 @5xl:w-auto @5xl:flex-1 @5xl:px-0">
              <NavLinks items={items} className="flex gap-1 whitespace-nowrap" />
            </nav>
          ) : <span className="flex-1" />}
          <LanguageSwitch ctx={ctx} className="ms-auto @5xl:ms-0" />
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 @5xl:grid-cols-[minmax(0,1fr)_21rem] @xl:px-6">
        <Main className="min-w-0 overflow-hidden rounded-[var(--site-radius)] border border-[color:var(--site-border)] @container">
          {body.map((s) => <Sec key={s.id} section={s} ctx={ctx} theme={theme} />)}
        </Main>
        <aside aria-labelledby="rail-title" className="hidden @5xl:block">
          <div className="sticky top-[calc(var(--site-top,0px)+4.5rem)] rounded-[var(--site-radius)] border border-[color:var(--site-border)] bg-[var(--site-surface)] p-5 text-[var(--site-text)] shadow-lg">
            <h2 id="rail-title" className="text-lg font-semibold">{t("rail.title")}</h2>
            {selected ? (
              <>
                <label htmlFor="rail-workshop" className="mt-4 block text-sm font-medium">{t("rail.choose")}</label>
                <select
                  id="rail-workshop" value={selected.id} onChange={(e) => setPicked(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-[var(--site-btn-radius)] border border-[color:var(--site-border)] bg-[var(--site-bg)] px-3 text-sm text-[var(--site-text)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--site-text)]/40"
                >
                  {list.map((w) => <option key={w.id} value={w.id}>{L(w.title)}</option>)}
                </select>
                <dl className="mt-4 space-y-1 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <dt className="inline-flex items-center gap-1.5 text-[var(--site-muted)]"><Clock className="size-4" aria-hidden />{t("rail.duration")}</dt>
                    <dd>{t("sections.duration", { minutes: selected.durationMinutes })}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <dt className="text-[var(--site-muted)]">{t("rail.price")}</dt>
                    <dd><span className="text-xl font-bold">{price}</span> <span className="text-[var(--site-muted)]">{t("sections.perPerson")}</span></dd>
                  </div>
                </dl>
                <button type="button" onClick={() => open(selected.id)} className={cn(primaryButton, "mt-5 min-h-12 w-full text-base")}>
                  {t("nav.book")}
                </button>
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--site-muted)]">{t("sections.noWorkshops")}</p>
            )}
          </div>
        </aside>
      </div>

      <div className={cn("sticky bottom-0 z-30 flex items-center gap-3 border-t border-[color:var(--site-border)] bg-[var(--site-bg)] p-3 text-[var(--site-text)] shadow-[0_-4px_12px_rgb(0_0_0/0.08)] @5xl:hidden")}>
        <p className="min-w-0 flex-1 text-sm">
          {selected ? (
            <>
              <span className="block truncate font-semibold">{L(selected.title)}</span>
              <span className="text-[var(--site-muted)]">{price} {t("sections.perPerson")}</span>
            </>
          ) : <span className="text-[var(--site-muted)]">{t("rail.title")}</span>}
        </p>
        <BookButton workshopId={selected?.id} className="min-h-12 px-6" />
      </div>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
