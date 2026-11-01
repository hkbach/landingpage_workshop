import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { ADMIN_LOCALES, DEFAULT_LOCALE, LOCALES, type Locale } from "@workshop/shared";
import { loadMessages } from "./messages";

export const UI_LOCALE_COOKIE = "ui_locale";

export default getRequestConfig(async ({ requestLocale }) => {
  // Public landing pages pass an explicit locale; the app host reads the UI cookie.
  const requested = await requestLocale;
  // /systemadmin is only available in English and Vietnamese: any other language of the cookie falls back to English there.
  const allowed: readonly string[] = (await headers()).get("x-ui-area") === "systemadmin" ? ADMIN_LOCALES : LOCALES;
  let locale: Locale = DEFAULT_LOCALE;
  if (requested && allowed.includes(requested)) {
    locale = requested as Locale;
  } else {
    const fromCookie = (await cookies()).get(UI_LOCALE_COOKIE)?.value;
    if (fromCookie && allowed.includes(fromCookie)) locale = fromCookie as Locale;
  }
  return { locale, messages: await loadMessages(locale) };
});
