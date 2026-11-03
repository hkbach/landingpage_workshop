"use client";

import { useTranslations } from "next-intl";
import { LifeBuoy, Mail, MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import { supportLinks, type SupportChannel, type SupportContact } from "@/lib/support-contact";

const ICONS: Record<SupportChannel, LucideIcon> = {
  whatsapp: MessageCircle,
  phone: Phone,
  zalo: MessageSquare,
  email: Mail,
};

/**
 * "Need help?" block: how to reach the platform team (WhatsApp, Phone, Zalo, Email). In the Publish card of the builder it comes with its hint
 * (`card`); under the menu of the dashboard (`sidebar`) it is one narrow column without the hint.
 */
export function SupportContactBox({ contact, variant = "card" }: { contact: SupportContact | null | undefined; variant?: "card" | "sidebar" }) {
  const t = useTranslations("builder");
  const links = supportLinks(contact);
  if (links.length === 0) return null;
  const sidebar = variant === "sidebar";

  return (
    <section aria-labelledby={`support-title-${variant}`} className={sidebar ? "" : "mt-5 border-t pt-4"} data-testid={`support-${variant}`}>
      <h3 id={`support-title-${variant}`} className="flex items-center gap-1.5 text-sm font-medium">
        <LifeBuoy className="size-4" aria-hidden />{t("support.title")}
      </h3>
      {sidebar ? null : <p className="mt-1 text-xs text-muted-foreground">{t("support.hint")}</p>}
      <ul className={sidebar ? "mt-2 grid gap-1.5" : "mt-3 grid gap-2 sm:grid-cols-2"}>
        {links.map((l) => {
          const Icon = ICONS[l.channel];
          return (
            <li key={l.channel}>
              <a
                href={l.href}
                {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className={sidebar
                  ? "flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                  : "flex min-h-11 items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{t(`support.channels.${l.channel}`)}</span>
                  <span className="block font-medium [overflow-wrap:anywhere]">{l.value}</span>
                </span>
                {l.external ? <span className="sr-only"> ({t("support.opensNewTab")})</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
