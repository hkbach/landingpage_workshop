"use server";

import { cookies } from "next/headers";
import { LOCALES } from "@workshop/shared";
import { UI_LOCALE_COOKIE } from "@/i18n/request";

/** Persist the dashboard UI language (not the shop's public languages). */
export async function setUiLocale(locale: string): Promise<void> {
  if (!(LOCALES as readonly string[]).includes(locale)) return;
  (await cookies()).set(UI_LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
