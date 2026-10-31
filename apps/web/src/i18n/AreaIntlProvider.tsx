import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { AREA_MESSAGES, pickAreas, type MessageArea } from "./client-messages";

/** Sends only the message areas of `area` to the browser (see client-messages.ts). Locale and time zone are inherited. */
export async function AreaIntlProvider({ area, children }: { area: MessageArea; children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={pickAreas(messages as Record<string, unknown>, AREA_MESSAGES[area])}>
      {children}
    </NextIntlClientProvider>
  );
}
