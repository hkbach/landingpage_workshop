"use client";

import { useTranslations } from "next-intl";
import { Languages, Settings, TriangleAlert } from "lucide-react";
import { LOCALES, type Locale } from "@workshop/shared";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ShopLink } from "@/components/dashboard/shell/shop-link";

/**
 * Language selector above the Sections list. It chooses the language of every text field in the editor: only the
 * selected language is shown at a time. Only the languages the shop enabled are offered; each chip shows how many
 * texts are still missing in that language.
 */
export function LanguageBar({ value, onChange, enabled, defaultLocale, missingByLocale }: {
  value: Locale;
  onChange: (locale: Locale) => void;
  enabled: readonly Locale[];
  defaultLocale: Locale;
  missingByLocale: Partial<Record<Locale, number>>;
}) {
  const t = useTranslations("builder");
  const offered = LOCALES.filter((l) => enabled.includes(l));

  return (
    <div className="rounded-xl border bg-card p-3 sm:px-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p id="language-bar-label" className="flex items-center gap-1.5 text-sm font-medium">
          <Languages className="size-4" aria-hidden />{t("language.barTitle")}
        </p>
        <ShopLink href="/shopowner/settings#languages" className={cn(buttonVariants({ variant: "outline" }), "h-9 gap-2 px-3.5 text-sm font-medium")}>
          <Settings className="size-4" aria-hidden />{t("language.manage")}
        </ShopLink>
      </div>
      <div role="radiogroup" aria-labelledby="language-bar-label" className="mt-2 flex flex-wrap gap-2">
        {offered.map((l) => {
          const selected = l === value;
          const missing = missingByLocale[l] ?? 0;
          return (
            <button
              key={l} type="button" role="radio" aria-checked={selected} onClick={() => onChange(l)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm outline-none transition focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-primary bg-primary text-primary-foreground" : "bg-background hover:bg-muted",
              )}
            >
              {t(`language.names.${l}`)}
              {l === defaultLocale ? <span className={cn("text-xs", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>({t("language.default")})</span> : null}
              {missing > 0 ? (
                <span className={cn("inline-flex items-center gap-1 text-xs", selected ? "text-primary-foreground" : "text-amber-800")}>
                  <TriangleAlert className="size-3.5" aria-hidden />
                  <span aria-label={t("language.missing", { count: missing })}>{missing}</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{t("language.barHint")}</p>
    </div>
  );
}
