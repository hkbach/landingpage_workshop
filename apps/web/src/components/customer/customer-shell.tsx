"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Heart, LogOut, Menu, Share2, Sparkles, Ticket, UserPlus, UserRound, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerAvatar } from "@/components/ops/customer-avatar";
import { LocaleSwitcher } from "@/components/dashboard/shell/locale-switcher";
import { siteFontClass } from "@/components/sections/site-fonts";
import { modalThemeStyle } from "@/components/sections/theme";
import { CustomerSupport } from "./customer-support";
import type { SupportContact } from "@/lib/support-contact";
import { GuestLoginForm } from "@/components/site/FavoritesProvider";
import { CustomerApiError, fetchCustomerProfile, type CustomerProfile } from "@/lib/customer-api";
import { readGuestEmail, subscribeFavorites, writeGuestEmail } from "@/lib/favorites";
import type { PageTheme } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface CustomerShop { slug: string; name: string }

interface CustomerContextValue {
  /** The email the guest logged in with; undefined while the login is switched off. */
  accountId: string; email: string | undefined; shop: CustomerShop; profile: CustomerProfile;
  /** The profile after the guest saved it (what the page and the header show). */
  setProfile: (profile: CustomerProfile) => void;
  /** Logs the guest out (forgets the email of the login in this browser) and goes back to the landing page of the shop. */
  logout: () => void;
}
const CustomerContext = createContext<CustomerContextValue | null>(null);

/** The account of the logged-in guest; only available below the shell, which shows its pages once the account is open. */
export function useCustomer(): CustomerContextValue {
  const value = useContext(CustomerContext);
  if (!value) throw new Error("useCustomer is used outside of the customer area");
  return value;
}

/** The menus of the guest area, in order: the path below /customer/{id} and the key of its text. */
export const CUSTOMER_MENUS: { path: string; key: "profile" | "today" | "bookings" | "favorites" | "workshops" | "affiliate" | "referrals"; icon: LucideIcon }[] = [
  { path: "profile", key: "profile", icon: UserRound },
  { path: "today", key: "today", icon: CalendarClock },
  { path: "bookings", key: "bookings", icon: Ticket },
  { path: "favorites", key: "favorites", icon: Heart },
  { path: "workshops", key: "workshops", icon: Sparkles },
  { path: "affiliate", key: "affiliate", icon: Share2 },
  { path: "referrals", key: "referrals", icon: UserPlus },
];

const card = "mx-auto mt-16 w-full max-w-md rounded-xl border bg-background p-6 shadow-sm";

/**
 * The guest area of /customer/{accountId}. When the login is required (always in production, see customerLoginRequired) only the guest who is logged in with the
 * email of that account gets in: anyone else is asked to log in, and an account that does not exist or belongs to another email gets the same answer (the server
 * says 404 for both). The login is the one of the landing page of the shop. While the prototype is tested the login is switched off and the area opens by its address.
 * TODO(api): the guest session is a cookie checked by the server; here the browser keeps the email of the OTP login and sends it with each request.
 */
export function CustomerShell({ accountId, shop, theme, loginRequired, support, children }: { accountId: string; shop: CustomerShop; theme: PageTheme; loginRequired: boolean; /** How to reach the platform team (shown under the menu). */ support?: SupportContact; children: ReactNode }) {
  const t = useTranslations("customer");
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  // null until the browser has been asked (the server cannot know who is logged in), "" when nobody is.
  const stored = useSyncExternalStore<string | null>(subscribeFavorites, () => readGuestEmail(shop.slug), () => null);
  const email = loginRequired ? stored : ""; // with no login there is nothing to ask the browser: the account is opened as it is
  const open = !loginRequired || Boolean(stored);
  const query = useQuery({
    queryKey: ["customer", accountId, loginRequired ? stored : "no-login"], queryFn: () => fetchCustomerProfile(accountId, loginRequired ? stored! : undefined), enabled: open, retry: false,
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const logout = () => { writeGuestEmail(shop.slug, null); queryClient.removeQueries({ queryKey: ["customer"] }); router.push(`/sites/${shop.slug}`); };
  // The menu of a phone is a drawer: Escape closes it, and it never stays open on another page.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  if (email === null || (open && query.isPending)) {
    return <div role="status" aria-busy="true" className={cn(card, "text-center text-sm text-muted-foreground")}>{t("shell.loading")}</div>;
  }
  if (loginRequired && email === "") {
    return (
      <div className={cn(card, siteFontClass(theme.font))} style={modalThemeStyle(theme)} data-testid="customer-login">
        <h1 className="text-lg font-semibold">{t("gate.loginTitle")}</h1>
        <p className="mb-4 mt-1 text-sm text-[var(--site-muted)]">{t("gate.loginIntro", { shop: shop.name })}</p>
        <GuestLoginForm slug={shop.slug} shopName={shop.name} onLoggedIn={(e) => writeGuestEmail(shop.slug, e)} onCancel={() => router.push(`/sites/${shop.slug}`)} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    const missing = query.error instanceof CustomerApiError && query.error.status === 404;
    return (
      <div role="alert" className={cn(card, "space-y-3")} data-testid={missing ? "customer-denied" : "customer-load-failed"}>
        <h1 className="text-lg font-semibold">{missing ? t("gate.deniedTitle") : t("gate.loadFailed")}</h1>
        {missing ? <p className="text-sm text-muted-foreground">{t("gate.deniedText")}</p> : null}
        <div className="flex flex-wrap gap-2">
          {missing && loginRequired ? <Button onClick={() => writeGuestEmail(shop.slug, null)}>{t("gate.switchAccount")}</Button> : null}
          {missing ? null : <Button onClick={() => void query.refetch()}>{t("gate.retry")}</Button>}
          <Link href={`/sites/${shop.slug}`} className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm hover:bg-muted">{t("shell.openSite", { shop: shop.name })}</Link>
        </div>
      </div>
    );
  }

  const profile = query.data;
  const value: CustomerContextValue = {
    accountId, email: loginRequired ? email || undefined : undefined, shop, profile,
    setProfile: (p) => queryClient.setQueryData(["customer", accountId, loginRequired ? stored : "no-login"], p), logout,
  };
  const activeMenu = CUSTOMER_MENUS.find((m) => pathname === `/customer/${encodeURIComponent(accountId)}/${m.path}`);
  return (
    <CustomerContext.Provider value={value}>
      <div className="min-h-screen bg-muted/30">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring">
          {t("shell.skipToContent")}
        </a>
        <header className="border-b bg-background">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-3 sm:px-4">
            {/* On a phone the menu is behind this button (three lines). */}
            <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("shell.openMenu")} aria-expanded={menuOpen} aria-controls="customer-menu" onClick={() => setMenuOpen(true)} data-testid="customer-menu-button">
              <Menu aria-hidden />
            </Button>
            {activeMenu ? <p className="min-w-0 truncate text-base font-semibold md:hidden">{t(`menu.${activeMenu.key}`)}</p> : null}
            <div className="ml-auto flex items-center gap-2">
              <LocaleSwitcher labelKey="customer.shell.language" />
              <span className="flex items-center gap-2" aria-label={t("shell.account", { name: profile.fullName })}>
                <CustomerAvatar name={profile.fullName} url={profile.account.avatarUrl} />
                <span className="hidden max-w-40 truncate text-sm sm:inline">{profile.fullName}</span>
              </span>
            </div>
          </div>
        </header>
        <div className="mx-auto grid max-w-6xl gap-4 px-3 py-4 sm:px-4 sm:py-6 grid-cols-[minmax(0,1fr)] md:grid-cols-[13rem_minmax(0,1fr)]">
          {menuOpen ? <button type="button" aria-label={t("shell.closeMenu")} className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMenuOpen(false)} /> : null}
          <div
            id="customer-menu"
            className={cn("fixed inset-y-0 left-0 z-40 w-72 max-w-[85vw] overflow-y-auto border-r bg-background p-3 shadow-xl transition-transform md:static md:z-auto md:w-auto md:max-w-none md:overflow-visible md:border-0 md:bg-transparent md:p-0 md:shadow-none md:translate-x-0 min-w-0", menuOpen ? "translate-x-0" : "max-md:invisible max-md:-translate-x-full")}
          >
          <div className="mb-3 flex items-center justify-between gap-2 md:hidden">
            <span className="flex min-w-0 items-center gap-2">
              <CustomerAvatar name={profile.fullName} url={profile.account.avatarUrl} />
              <span className="truncate text-sm font-medium">{profile.fullName}</span>
            </span>
            <Button variant="ghost" size="icon" aria-label={t("shell.closeMenu")} onClick={() => setMenuOpen(false)}><X aria-hidden /></Button>
          </div>
          <nav aria-label={t("shell.menuLabel")}>
            <ul className="flex flex-col gap-1">
              {CUSTOMER_MENUS.map(({ path, key, icon: Icon }) => {
                const href = `/customer/${encodeURIComponent(accountId)}/${path}`;
                const active = pathname === href;
                return (
                  <li key={path}>
                    <Link
                      href={href} aria-current={active ? "page" : undefined} onClick={() => setMenuOpen(false)}
                      className={cn("flex min-h-11 items-center md:min-h-9 gap-2 rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", active ? "bg-primary text-primary-foreground hover:bg-primary" : "text-foreground")}
                    >
                      <Icon className="size-4" aria-hidden />{t(`menu.${key}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <Button variant="outline" className="mt-3 w-full justify-start" onClick={logout} data-testid="customer-menu-logout"><LogOut aria-hidden />{t("shell.logout")}</Button>
          <CustomerSupport contact={support} />
          </div>
          <main id="main" className="min-w-0">{children}</main>
        </div>
      </div>
    </CustomerContext.Provider>
  );
}

/** A page of the guest area that has no content yet: its title only. */
export function CustomerBlankPage({ menu }: { menu: "today" }) {
  const t = useTranslations("customer.menu");
  return <h1 className="text-2xl font-semibold">{t(menu)}</h1>;
}
