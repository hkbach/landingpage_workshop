import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@workshop/shared";
import { loadMessages } from "./messages";

export const UI_LOCALE_COOKIE = "ui_locale";

export default getRequestConfig(async ({ requestLocale }) => {
  // Public landing pages pass an explicit locale; the app host reads the UI cookie.
  const requested = await requestLocale;
  let locale: Locale = DEFAULT_LOCALE;
  if (requested && (LOCALES as readonly string[]).includes(requested)) {
    locale = requested as Locale;
  } else {
    const fromCookie = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
    if (fromCookie && (LOCALES as readonly string[]).includes(fromCookie)) locale = fromCookie as Locale;
  }
  return { locale, messages: await loadMessages(locale) };
});
