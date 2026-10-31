import { getTranslations } from "next-intl/server";
import type { Locale } from "@workshop/shared";
import { safeImage } from "@/components/sections/safe-url";
import { LOCALE_NAMES } from "./locale-names";

export interface LanguageLink { locale: Locale; href: string }

/** Server component: plain links, works without JS. `t` locale is the site locale via an explicit getTranslations call. */
export async function SiteHeader({ shopName, logoUrl, homeHref, locale, languages }: {
  shopName: string; logoUrl?: string; homeHref: string; locale: Locale; languages: LanguageLink[];
}) {
  const t = await getTranslations({ locale, namespace: "site" });
  const logo = safeImage(logoUrl);
  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-[var(--site-bg)]">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <a href={homeHref} className="flex items-center gap-2 font-semibold text-[var(--site-text)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logo ? <img src={logo} alt="" className="size-8 rounded object-cover" referrerPolicy="no-referrer" /> : null}
          <span>{shopName}</span>
        </a>
        {languages.length > 1 ? (
          <nav aria-label={t("header.language")}>
            <ul className="flex gap-1 text-sm">
              {languages.map((l) => (
                <li key={l.locale}>
                  <a
                    href={l.href} hrefLang={l.locale} lang={l.locale} aria-current={l.locale === locale ? "true" : undefined}
                    className={`inline-flex min-h-11 items-center rounded-md px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--site-primary)] ${
                      l.locale === locale ? "bg-[var(--site-primary)] font-semibold text-[var(--site-primary-fg)]" : "text-[var(--site-text)] hover:bg-black/5"
                    }`}
                  >
                    {LOCALE_NAMES[l.locale]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
      </div>
    </header>
  );
}
