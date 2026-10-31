"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2, ClipboardCheck, Flag, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin/organizations", key: "organizations", Icon: Building2 },
  { href: "/admin/reviews", key: "reviews", Icon: ClipboardCheck },
  { href: "/admin/reports", key: "reports", Icon: Flag },
  { href: "/admin/audit-logs", key: "auditLogs", Icon: ScrollText },
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
