"use client";

import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { BookButton, Brand, Footer, FrameRoot, LanguageSwitch, Main, Sec, STICKY_TOP, type FrameProps } from "./kit";
import { journeyRuns } from "./logic";

const VARS = { "--sec-px": "1.25rem", "--sec-max": "100%", "--site-pad": "clamp(2rem, 5vw, 3.5rem)" } as CSSProperties;
const marker = "absolute start-0 top-0 z-10 grid size-10 place-items-center rounded-full bg-[var(--site-primary)] font-bold text-[var(--site-primary-fg)] ring-4 ring-[var(--site-bg)]";

/** Journey: a vertical rail with step markers (Discover, Choose, Visit, Book) that connects the sections. */
export function JourneyFrame({ body, footer, theme, ctx }: FrameProps) {
  const t = useTranslations("site");
  const runs = journeyRuns(body);
  return (
    <FrameRoot className="bg-[var(--site-bg)] text-[var(--site-text)]" style={VARS}>
      <header className={cn("sticky z-30 border-b border-[color:var(--site-border)] bg-[var(--site-bg)]", STICKY_TOP)}>
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-2 @xl:px-6">
          <Brand theme={theme} ctx={ctx} className="flex-1" />
          <LanguageSwitch ctx={ctx} />
          <BookButton />
        </div>
      </header>
      <Main className="mx-auto w-full max-w-5xl px-4 py-8 @xl:px-6">
        <ol>
          {runs.map((run) => (
            <li key={`${run.step}-${run.number}`} className="relative pb-10 ps-14 @3xl:ps-20">
              <span aria-hidden className="absolute start-5 top-0 bottom-0 w-0.5 bg-[var(--site-primary)]/35" />
              <span aria-hidden className={marker}>{run.number}</span>
              <p className="mb-4 flex h-10 items-center text-sm font-semibold uppercase tracking-[0.2em]">
                <span className="sr-only">{t("journey.step", { number: run.number })}: </span>{t(`journey.steps.${run.step}`)}
              </p>
              <div className="grid gap-6">
                {run.sections.map((s) => (
                  <div key={s.id} className="overflow-hidden rounded-[var(--site-radius)] border border-[color:var(--site-border)] @container">
                    <Sec section={s} ctx={ctx} theme={theme} />
                  </div>
                ))}
              </div>
            </li>
          ))}
          <li className="relative ps-14 @3xl:ps-20">
            <span aria-hidden className={marker}><Check className="size-5" /></span>
            <div className="flex min-h-10 flex-wrap items-center gap-4">
              <p className="text-lg font-semibold">{t("journey.finish")}</p>
              <BookButton className="min-h-12 px-8 text-base" />
            </div>
          </li>
        </ol>
      </Main>
      <Footer footer={footer} ctx={ctx} theme={theme} />
    </FrameRoot>
  );
}
