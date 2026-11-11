import type { ReactNode } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MarketingNav } from "./marketing-nav";

/** The frame of the three public pages (Home, About Us, Contact): the dark bar on top, the page, and the footer. */
export async function MarketingShell({ children }: { children: ReactNode }) {
  const t = await getTranslations("marketing");
  const tc = await getTranslations("common");
  const name = tc("appName");
  return (
    <div className="flex min-h-screen flex-col bg-[#050b1f] text-white" data-testid="marketing-shell">
      <a href="#main" className="sr-only z-50 rounded-md bg-white px-3 py-2 text-sm text-slate-900 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">{t("nav.skip")}</a>
      <MarketingNav appName={name} />
      <main id="main" className="flex-1">{children}</main>
      <footer className="border-t border-white/10 bg-[#030712]">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <p className="text-lg font-semibold">{name}</p>
            <p className="mt-2 max-w-xs text-sm text-white/65">{t("footer.tagline")}</p>
          </div>
          <FooterGroup title={t("footer.product")} links={[["/", t("nav.home")], ["/about", t("nav.about")], ["/contact", t("nav.contact")]]} />
          <FooterGroup title={t("footer.company")} links={[["/login", t("nav.login")], ["/signup", t("nav.signup")]]} />
          <FooterGroup title={t("footer.legal")} links={[["/privacy", t("footer.privacy")], ["/terms", t("footer.terms")]]} />
        </div>
        <p className="border-t border-white/10 px-4 py-5 text-center text-xs text-white/55">{t("footer.rights", { year: 2026, name })}</p>
      </footer>
    </div>
  );
}

function FooterGroup({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <nav aria-label={title}>
      <p className="text-sm font-semibold text-white">{title}</p>
      <ul className="mt-3 grid gap-2">
        {links.map(([href, label]) => (
          <li key={href}><Link href={href} className="text-sm text-white/65 transition hover:text-white">{label}</Link></li>
        ))}
      </ul>
    </nav>
  );
}
