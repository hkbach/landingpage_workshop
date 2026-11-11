"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, BookOpen, Building2, CalendarClock, Coins, Flag, Globe, Headset, Percent, ScrollText, Share2, Ticket, UserCog, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/systemadmin/users", key: "users", Icon: UserCog },
  { href: "/systemadmin/organizations", key: "organizations", Icon: Building2 },
  { href: "/systemadmin/workshops", key: "workshops", Icon: BookOpen },
  { href: "/systemadmin/bookings", key: "bookings", Icon: Ticket },
  { href: "/systemadmin/customers", key: "customers", Icon: Users },
  { href: "/systemadmin/sessions", key: "sessions", Icon: CalendarClock },
  { href: "/systemadmin/landing-pages", key: "landingPages", Icon: Globe },
  { href: "/systemadmin/affiliate", key: "affiliate", Icon: Share2 },
  { href: "/systemadmin/referrals", key: "referrals", Icon: UserPlus },
  { href: "/systemadmin/income", key: "income", Icon: Coins },
  { href: "/systemadmin/withdrawals", key: "withdrawals", Icon: Banknote },
  { href: "/systemadmin/fees", key: "fees", Icon: Percent },
  { href: "/systemadmin/reports", key: "reports", Icon: Flag },
  { href: "/systemadmin/support-contact", key: "supportContact", Icon: Headset },
  { href: "/systemadmin/audit-logs", key: "auditLogs", Icon: ScrollText },
] as const;

export function AdminNav() {
  const t = useTranslations("admin");
  const pathname = usePathname();

  return (
    <nav aria-label={t("shell.navLabel")}>
      <ul className="flex gap-1 overflow-x-auto md:flex-col">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {t(`nav.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
