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

/** "Need help?" block of the Publish card: how to reach the platform team (WhatsApp, Phone, Zalo, Email). */
export function SupportContactBox({ contact }: { contact: SupportContact | null | undefined }) {
  const t = useTranslations("builder");
  const links = supportLinks(contact);
  if (links.length === 0) return null;

  return (
    <section aria-labelledby="support-title" className="mt-5 border-t pt-4">
      <h3 id="support-title" className="flex items-center gap-1.5 text-sm font-medium">
        <LifeBuoy className="size-4" aria-hidden />{t("support.title")}
      </h3>
      <p className="mt-1 text-xs text-muted-foreground">{t("support.hint")}</p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {links.map((l) => {
          const Icon = ICONS[l.channel];
          return (
            <li key={l.channel}>
              <a
                href={l.href}
                {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="flex min-h-11 items-center gap-2.5 rounded-lg border bg-background px-3 py-2 text-sm outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
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
