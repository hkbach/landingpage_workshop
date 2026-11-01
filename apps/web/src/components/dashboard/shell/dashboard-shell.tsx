"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import type { OrgStatus } from "@workshop/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { NAV_ITEMS } from "./nav";
import { statusBadgeVariant } from "./options";
import { UserMenu } from "./user-menu";
import { ShopLink, useShopHref } from "@/components/dashboard/shell/shop-link";

export interface ShellShop {
  name: string; slug: string; status: OrgStatus; ownerName: string; ownerEmail: string;
}

export function DashboardShell({ shop, banner, children }: { shop: ShellShop; banner: ReactNode; children: ReactNode }) {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toShop = useShopHref();
  const isActive = (href: string) => {
    const full = toShop(href);
    return href === "/shopowner" ? pathname === full : pathname.startsWith(full);
  };

  return (
    <div className="flex min-h-screen bg-muted/30">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:ring-2 focus:ring-ring">
        {t("dashboard.shell.skipToContent")}
      </a>
      {open ? (
        <button type="button" aria-label={t("dashboard.shell.closeMenu")} className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      ) : null}
      <aside
        id="dashboard-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-background transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "max-md:invisible max-md:-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b px-4">
          <ShopLink href="/shopowner" className="truncate font-semibold" onClick={() => setOpen(false)}>
            {t("common.appName")}
          </ShopLink>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label={t("dashboard.shell.closeMenu")} onClick={() => setOpen(false)}>
            <X aria-hidden />
          </Button>
        </div>
        <nav aria-label={t("dashboard.shell.mainNav")} className="flex-1 overflow-y-auto p-2">
          <ul className="grid gap-1">
            {NAV_ITEMS.map(({ href, key, icon: Icon }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <ShopLink
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                      active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="size-4 shrink-0" aria-hidden />
                    {t(`dashboard.shell.nav.${key}`)}
                  </ShopLink>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background px-3 sm:px-4">
          <Button
            variant="ghost" size="icon" className="md:hidden" aria-label={t("dashboard.shell.openMenu")}
            aria-expanded={open} aria-controls="dashboard-sidebar" onClick={() => setOpen(true)}
          >
            <Menu aria-hidden />
          </Button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-semibold">{shop.name}</span>
            <Badge variant={statusBadgeVariant(shop.status)}>{t(`common.orgStatus.${shop.status}`)}</Badge>
          </div>
          <LocaleSwitcher />
          <UserMenu name={shop.ownerName} email={shop.ownerEmail} />
        </header>
        {banner}
        <main id="main" className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
