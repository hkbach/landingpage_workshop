import type { ReactNode } from "react";
import type { Locale } from "@workshop/shared";
import type { PageTheme } from "@/lib/types";
import { themeStyle } from "@/components/sections/theme";

/** Applies the shop theme (CSS variables only) and the content language to a public page. */
export function SiteFrame({ theme, locale, children }: { theme: PageTheme; locale: Locale; children: ReactNode }) {
  return (
    <div style={themeStyle(theme)} lang={locale} className="min-h-screen">
      {children}
    </div>
  );
}
