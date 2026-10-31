import type { ReactNode } from "react";
import type { Locale } from "@workshop/shared";
import type { PageTheme } from "@/lib/types";
import { siteFontClass } from "@/components/sections/site-fonts";
import { themeStyle } from "@/components/sections/theme";
import { cn } from "@/lib/utils";

/** Applies the shop theme (CSS variables + the one font the site uses) and the content language to a public page. */
export function SiteFrame({ theme, locale, children }: { theme: PageTheme; locale: Locale; children: ReactNode }) {
  return (
    <div style={themeStyle(theme)} lang={locale} className={cn("min-h-screen", siteFontClass(theme.font))}>
      {children}
    </div>
  );
}
