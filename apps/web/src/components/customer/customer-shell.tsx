"use client";

import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Heart, LogOut, Sparkles, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerAvatar } from "@/components/ops/customer-avatar";
import { LocaleSwitcher } from "@/components/dashboard/shell/locale-switcher";
import { siteFontClass } from "@/components/sections/site-fonts";
import { modalThemeStyle } from "@/components/sections/theme";
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
}
const CustomerContext = createContext<CustomerContextValue | null>(null);

/** The account of the logged-in guest; only available below the shell, which shows its pages once the account is open. */
export function useCustomer(): CustomerContextValue {
  const value = useContext(CustomerContext);
  if (!value) throw new Error("useCustomer is used outside of the customer area");
  return value;
}

/** The menus of the guest area, in order: the path below /customer/{id} and the key of its text. */
export const CUSTOMER_MENUS: { path: string; key: "profile" | "today" | "bookings" | "favorites" | "workshops"; icon: LucideIcon }[] = [
  { path: "profile", key: "profile", icon: UserRound },
  { path: "today", key: "today", icon: CalendarClock },
  { path: "bookings", key: "bookings", icon: Ticket },
  { path: "favorites", key: "favorites", icon: Heart },
  { path: "workshops", key: "workshops", icon: Sparkles },
];

const card = "mx-auto mt-16 w-full max-w-md rounded-xl border bg-background p-6 shadow-sm";

/**
 * The guest area of /customer/{accountId}. When the login is required (always in production, see customerLoginRequired) only the guest who is logged in with the
 * email of that account gets in: anyone else is asked to log in, and an account that does not exist or belongs to another email gets the same answer (the server
 * says 404 for both). The login is the one of the landing page of the shop. While the prototype is tested the login is switched off and the area opens by its address.
 * TODO(api): the guest session is a cookie checked by the server; here the browser keeps the email of the OTP login and sends it with each request.
 */
export function CustomerShell({ accountId, shop, theme, loginRequired, children }: { accountId: string; shop: CustomerShop; theme: PageTheme; loginRequired: boolean; children: ReactNode }) {
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
  const logout = () => writeGuestEmail(shop.slug, null);

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
          {missing && loginRequired ? <Button onClick={logout}>{t("gate.switchAccount")}</Button> : null}
          {missing ? null : <Button onClick={() => void query.refetch()}>{t("gate.retry")}</Button>}
          <Link href={`/sites/${shop.slug}`} className="inline-flex h-8 items-center rounded-lg border px-2.5 text-sm hover:bg-muted">{t("shell.openSite", { shop: shop.name })}</Link>
        </div>
      </div>
    );
  }

  const profile = query.data;
  const value: CustomerContextValue = {
    accountId, email: loginRequired ? email || undefined : undefined, shop, profile,
    setProfile: (p) => queryClient.setQueryData(["customer", accountId, loginRequired ? stored : "no-login"], p),
  };
  return (
    <CustomerContext.Provider value={value}>
      <div className="min-h-screen bg-muted/30">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring">
          {t("shell.skipToContent")}
        </a>
        <header className="border-b bg-background">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4">
            <Link href={`/sites/${shop.slug}`} className="truncate font-semibold" title={t("shell.openSite", { shop: shop.name })}>{shop.name}</Link>
            <div className="ml-auto flex items-center gap-2">
              <LocaleSwitcher labelKey="customer.shell.language" />
              <span className="hidden items-center gap-2 sm:flex" aria-label={t("shell.account", { name: profile.fullName })}>
                <CustomerAvatar name={profile.fullName} url={profile.account.avatarUrl} />
                <span className="max-w-40 truncate text-sm">{profile.fullName}</span>
              </span>
              {loginRequired ? <Button variant="outline" onClick={logout}><LogOut aria-hidden />{t("shell.logout")}</Button> : null}
            </div>
          </div>
        </header>
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-6 md:grid-cols-[13rem_minmax(0,1fr)]">
          <nav aria-label={t("shell.menuLabel")}>
            <ul className="flex gap-1 overflow-x-auto md:flex-col">
              {CUSTOMER_MENUS.map(({ path, key, icon: Icon }) => {
                const href = `/customer/${encodeURIComponent(accountId)}/${path}`;
                const active = pathname === href;
                return (
                  <li key={path} className="shrink-0">
                    <Link
                      href={href} aria-current={active ? "page" : undefined}
                      className={cn("flex min-h-9 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50", active ? "bg-primary text-primary-foreground hover:bg-primary" : "text-foreground")}
                    >
                      <Icon className="size-4" aria-hidden />{t(`menu.${key}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
          <main id="main" className="min-w-0">{children}</main>
        </div>
      </div>
    </CustomerContext.Provider>
  );
}

/** A page of the guest area that has no content yet: its title only. */
export function CustomerBlankPage({ menu }: { menu: "today" | "bookings" | "favorites" | "workshops" }) {
  const t = useTranslations("customer.menu");
  return <h1 className="text-2xl font-semibold">{t(menu)}</h1>;
}
