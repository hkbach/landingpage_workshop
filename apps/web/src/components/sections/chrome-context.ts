"use client";

import { createContext } from "react";
import type { Locale } from "@workshop/shared";

/** Lets the frame's language switcher change the language in place (builder preview); absent on the public site (links). */
export interface SiteChrome { onSelectLocale?: (locale: Locale) => void }

export const SiteChromeContext = createContext<SiteChrome>({});
