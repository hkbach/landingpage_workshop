"use client";

import { useTranslations } from "next-intl";
import { LifeBuoy, Mail, MessageCircle, MessageSquare, Phone, type LucideIcon } from "lucide-react";
import { supportLinks, type SupportChannel, type SupportContact } from "@/lib/support-contact";

const ICONS: Record<SupportChannel, LucideIcon> = { whatsapp: MessageCircle, phone: Phone, zalo: MessageSquare, email: Mail };

/**
 * "Need help?" under the menu of the guest area: how a customer reaches the platform team (WhatsApp, Phone, Zalo, Email). The same contact details the shop owners see (set by the
 * platform admin, see lib/mock/platform.ts): the support of the PLATFORM, never the contact details of the shop. Only the channels that were filled in are shown, and each link is built
 * (and checked) by `supportLinks`.
 */
export function CustomerSupport({ contact }: { contact: SupportContact | null | undefined }) {
  const t = useTranslations("customer.support");
  const links = supportLinks(contact);
  if (links.length === 0) return null;
  return (
    <section aria-labelledby="customer-support-title" className="mt-4 border-t pt-4" data-testid="customer-support">
      <h2 id="customer-support-title" className="flex items-center gap-1.5 text-sm font-medium"><LifeBuoy className="size-4" aria-hidden />{t("title")}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
      <ul className="mt-2 grid gap-1.5">
        {links.map((l) => {
          const Icon = ICONS[l.channel];
          return (
            <li key={l.channel}>
              <a
                href={l.href} {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} data-testid={`customer-support-${l.channel}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-xs text-muted-foreground">{t(`channels.${l.channel}`)}</span>
                  <span className="block font-medium [overflow-wrap:anywhere]">{l.value}</span>
                </span>
                {l.external ? <span className="sr-only"> ({t("opensNewTab")})</span> : null}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
