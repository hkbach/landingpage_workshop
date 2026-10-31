"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { TriangleAlert } from "lucide-react";
import { LOCALES, type Locale } from "@workshop/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/**
 * Language tab bar (en/vi/ko/ja). `incomplete` marks locales that are enabled for the shop but have
 * missing translations; the marker is text/icon (sr-only label), not colour alone.
 */
export function LanguageTabs({
  value, onValueChange, enabled, defaultLocale, incomplete, children,
}: {
  value: Locale; onValueChange: (l: Locale) => void; enabled: readonly Locale[]; defaultLocale: Locale;
  incomplete: readonly Locale[]; children: (locale: Locale) => ReactNode;
}) {
  const t = useTranslations("catalog");
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as Locale)}>
      <TabsList className="h-auto flex-wrap" aria-label={t("lang.label")}>
        {LOCALES.map((l) => (
          <TabsTrigger key={l} value={l} className="min-h-8 px-3">
            {t(`lang.${l}`)}
            {l === defaultLocale ? <span className="text-xs text-muted-foreground">({t("lang.default")})</span> : null}
            {!enabled.includes(l) ? <span className="text-xs text-muted-foreground">({t("lang.disabled")})</span> : null}
            {incomplete.includes(l) ? (
              <>
                <TriangleAlert className="size-3.5 text-amber-700" aria-hidden="true" />
                <span className="sr-only">{t("lang.missingSr")}</span>
              </>
            ) : null}
          </TabsTrigger>
        ))}
      </TabsList>
      {LOCALES.map((l) => (
        <TabsContent key={l} value={l} className="grid gap-4 pt-2">
          {children(l)}
        </TabsContent>
      ))}
    </Tabs>
  );
}
