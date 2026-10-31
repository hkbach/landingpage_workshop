"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { resolveShopLocale, type Locale } from "@workshop/shared";

// Shop screens follow the shop's language setting (default + enabled languages): they never show or edit a language
// the shop has turned off, and a text that is missing falls back to the default language.

interface ShopLanguages { enabledLocales: readonly Locale[]; defaultLocale: Locale }

/**
 * Language in which shop content (workshop names, ...) is displayed in the dashboard: the dashboard language when the
 * shop has enabled it, otherwise the shop's default language.
 */
export function useDisplayLocale(shop: ShopLanguages): Locale {
  const ui = useLocale();
  return resolveShopLocale(ui, shop.enabledLocales, shop.defaultLocale);
}

// --- Editing language: one choice shared by every screen where the shop types localized text -----------------------

const KEY = "editing-language";
const listeners = new Set<() => void>();

function read(): string | null {
  try { return window.localStorage.getItem(KEY); } catch { return null; }
}
function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  window.addEventListener("storage", callback);
  return () => { listeners.delete(callback); window.removeEventListener("storage", callback); };
}

/**
 * The language the shop is currently writing in. It is remembered, so the page builder and the workshop form open in the
 * same language, and it is always one of the shop's enabled languages (the default language otherwise).
 */
export function useEditingLanguage(enabled: readonly Locale[], defaultLocale: Locale): readonly [Locale, (locale: Locale) => void] {
  const stored = useSyncExternalStore(subscribe, read, () => null);
  const locale = resolveShopLocale(stored, enabled, defaultLocale);
  const set = useCallback((next: Locale) => {
    try { window.localStorage.setItem(KEY, next); } catch { /* storage blocked: the choice just is not remembered */ }
    listeners.forEach((l) => l());
  }, []);
  return [locale, set] as const;
}
