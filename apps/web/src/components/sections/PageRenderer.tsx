"use client";

import type { PageContent, PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { RenderContext } from "./context";
import { SectionRenderer } from "./SectionRenderer";
import { siteFontClass } from "./site-fonts";
import { themeStyle } from "./theme";

/** Renders the enabled sections of a page. Same component for the builder preview and the public site. */
export function PageRenderer({ content, theme, ctx }: { content: PageContent; theme: PageTheme; ctx: RenderContext }) {
  const sections = content.sections.filter((s) => s.enabled);
  // Footer is mandatory: render it last even if a draft is missing or has it disabled.
  const footer = content.sections.find((s) => s.type === "footer");
  const body = sections.filter((s) => s.type !== "footer");
  return (
    <div style={themeStyle(theme)} lang={ctx.locale} className={cn("min-h-full", siteFontClass(theme.font))}>
      <main>
        {body.map((s) => (
          <SectionRenderer key={s.id} section={s} ctx={ctx} theme={theme} />
        ))}
      </main>
      {footer ? <SectionRenderer section={{ ...footer, enabled: true }} ctx={ctx} theme={theme} /> : null}
    </div>
  );
}
