import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import type { Locale } from "@workshop/shared";
import { loadMessages } from "@/i18n/messages";

/** Public site chrome speaks the visitor's site locale (not the dashboard UI cookie). Only the `site` area is sent to the client. */
export async function SiteIntlProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const messages = await loadMessages(locale);
  return (
    <NextIntlClientProvider locale={locale} messages={{ site: messages.site as Record<string, unknown> }}>
      {children}
    </NextIntlClientProvider>
  );
}
