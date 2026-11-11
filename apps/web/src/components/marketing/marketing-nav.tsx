"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, Sparkles, X } from "lucide-react";
import { LocaleSwitcher } from "@/components/dashboard/shell/locale-switcher";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", key: "home" },
  { href: "/about", key: "about" },
  { href: "/contact", key: "contact" },
] as const;

// The language button sits on a dark bar: it is made light-on-dark here instead of changing the shared button.
const DARK_SWITCH = "[&_button]:border-white/20 [&_button]:bg-white/10 [&_button]:text-white [&_button:hover]:bg-white/20";

/** The bar of the public site: the name, the three pages, the language, Log in and Sign up. On a phone the pages and the buttons are behind the three-line button. */
export function MarketingNav({ appName }: { appName: string }) {
  const t = useTranslations("marketing.nav");
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const link = (href: string, key: string, mobile = false) => {
    const active = pathname === href;
    return (
      <Link
        key={href} href={href} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}
        className={cn("rounded-full px-4 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300", mobile && "block py-3 text-base", active ? "bg-white/15 text-white" : "text-white/75 hover:text-white")}
      >
        {t(key as never)}
      </Link>
    );
  };
  const signup = (
    <Link href="/signup" onClick={() => setOpen(false)} className="inline-flex h-10 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-slate-900 outline-none transition hover:bg-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-300">
      {t("signup")}<Sparkles className="size-4" aria-hidden />
    </Link>
  );
  const login = (
    <Link href="/login" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-full px-4 text-sm font-medium text-white/85 outline-none transition hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-300">
      {t("login")}
    </Link>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#050b1f]/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="truncate text-lg font-semibold tracking-tight text-white" data-testid="marketing-brand">{appName}</Link>
        <nav aria-label={t("label")} className="hidden items-center gap-1 md:flex" data-testid="marketing-links">{LINKS.map((l) => link(l.href, l.key))}</nav>
        <div className="flex items-center gap-2">
          <div className={DARK_SWITCH}><LocaleSwitcher labelKey="marketing.nav.language" /></div>
          <div className="hidden items-center gap-1 md:flex">{login}{signup}</div>
          <button
            type="button" className="grid size-10 place-items-center rounded-full border border-white/20 bg-white/10 text-white outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 md:hidden"
            aria-label={open ? t("closeMenu") : t("openMenu")} aria-expanded={open} aria-controls="marketing-menu" onClick={() => setOpen((v) => !v)} data-testid="marketing-menu-button"
          >
            {open ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </button>
        </div>
      </div>
      {open ? (
        <div id="marketing-menu" className="border-t border-white/10 bg-[#050b1f] px-4 pb-5 pt-2 md:hidden" data-testid="marketing-menu">
          <nav aria-label={t("label")} className="grid">{LINKS.map((l) => link(l.href, l.key, true))}</nav>
          <div className="mt-3 flex items-center gap-2">{login}{signup}</div>
        </div>
      ) : null}
    </header>
  );
}
