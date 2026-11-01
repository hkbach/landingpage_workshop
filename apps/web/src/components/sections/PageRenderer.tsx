"use client";

import { useMemo } from "react";
import type { PageContent, PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { RenderContext } from "./context";
import { FRAMES } from "./frames";
import { splitSections } from "./frames/logic";
import { resolveLayout } from "./layouts";
import { siteFontClass } from "./site-fonts";
import { themeStyle } from "./theme";

/**
 * Renders the page: picks the frame (page structure) of `content.layout` and hands it the enabled, ordered sections.
 * The footer is mandatory and handled by every frame. Same component for the builder preview and the public site.
 * The wrapper is a size container so every layout responds to the width it actually has (preview frame or window).
 */
export function PageRenderer({ content, theme, ctx }: { content: PageContent; theme: PageTheme; ctx: RenderContext }) {
  // The promotions section only exists while a promotion is active: without one it would be an empty block (and a dead menu link).
  const hasPromotions = (ctx.promotions?.length ?? 0) > 0;
  const { body, footer } = useMemo(
    () => splitSections(hasPromotions ? content.sections : content.sections.filter((s) => s.type !== "promotions")),
    [content.sections, hasPromotions],
  );
  const Frame = FRAMES[resolveLayout(content.layout)];
  return (
    <div
      style={themeStyle(theme)} lang={ctx.locale} data-layout={resolveLayout(content.layout)}
      className={cn("min-h-full @container", siteFontClass(theme.font))}
    >
      <Frame body={body} footer={footer} theme={theme} ctx={ctx} />
    </div>
  );
}
