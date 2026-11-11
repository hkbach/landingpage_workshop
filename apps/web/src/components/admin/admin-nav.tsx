"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Banknote, BookOpen, Building2, CalendarClock, Coins, Flag, Globe, Headset, ImageIcon, Inbox, Tag, Mail, Scale, Settings, Percent, ScrollText, Share2, Star, Ticket, UserCog, UserPlus, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// The pages of the admin area in three groups (shown as headings on a PC; a phone shows one scrolling row).
const GROUPS = [
  {
    key: "operations",
    items: [
      { href: "/systemadmin/organizations", key: "organizations", Icon: Building2 },
      { href: "/systemadmin/users", key: "users", Icon: UserCog },
      { href: "/systemadmin/customers", key: "customers", Icon: Users },
      { href: "/systemadmin/workshops", key: "workshops", Icon: BookOpen },
      { href: "/systemadmin/sessions", key: "sessions", Icon: CalendarClock },
      { href: "/systemadmin/bookings", key: "bookings", Icon: Ticket },
      { href: "/systemadmin/landing-pages", key: "landingPages", Icon: Globe },
      { href: "/systemadmin/media", key: "media", Icon: ImageIcon },
      { href: "/systemadmin/ratings", key: "ratings", Icon: Star },
    ],
  },
  {
    key: "finance",
    items: [
      { href: "/systemadmin/income", key: "income", Icon: Coins },
      { href: "/systemadmin/promotions", key: "promotions", Icon: Tag },
      { href: "/systemadmin/withdrawals", key: "withdrawals", Icon: Banknote },
      { href: "/systemadmin/fees", key: "fees", Icon: Percent },
      { href: "/systemadmin/affiliate", key: "affiliate", Icon: Share2 },
      { href: "/systemadmin/referrals", key: "referrals", Icon: UserPlus },
    ],
  },
  {
    key: "platform",
    items: [
      { href: "/systemadmin/reports", key: "reports", Icon: Flag },
      { href: "/systemadmin/settings", key: "settings", Icon: Settings },
      { href: "/systemadmin/messages", key: "messages", Icon: Inbox },
      { href: "/systemadmin/emails", key: "emails", Icon: Mail },
      { href: "/systemadmin/legal", key: "legal", Icon: Scale },
      { href: "/systemadmin/support-contact", key: "supportContact", Icon: Headset },
      { href: "/systemadmin/audit-logs", key: "auditLogs", Icon: ScrollText },
    ],
  },
] as const;

export function AdminNav() {
  const t = useTranslations("admin");
  const pathname = usePathname();

  return (
    <nav aria-label={t("shell.navLabel")} className="min-h-0 md:flex-1 md:overflow-y-auto md:pr-1">
      <div className="flex gap-4 overflow-x-auto md:flex-col md:gap-5 md:overflow-visible">
        {GROUPS.map((g) => (
          <div key={g.key} className="flex shrink-0 gap-1 md:flex-col" role="group" aria-label={t(`nav.group.${g.key}`)}>
            <p className="hidden px-3 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground md:block">{t(`nav.group.${g.key}`)}</p>
            <ul className="flex gap-1 md:flex-col">
              {g.items.map(({ href, key, Icon }) => {
                const active = pathname === href || pathname.startsWith(`${href}/`);
                return (
                  <li key={href} className="shrink-0">
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                        active ? "bg-primary text-primary-foreground shadow-sm" : "text-foreground/80 hover:bg-muted hover:text-foreground",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {t(`nav.${key}`)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
