// The workshops the public site shows (the Workshops section of the home page): a random pick from the shops that the platform lists, so every shop has its turn. Mock of what the API will
// give once apps/api exists. TODO(api): GET /public/workshops/featured?limit=10 (ACTIVE workshops of ACTIVE, listed shops; cached for a short time).
import { pickLocalized, type Locale } from "@workshop/shared";
import type { Workshop } from "../types";
import { listedShops } from "./customer-listing";

export interface ShowcaseWorkshop {
  id: string; title: string; shopName: string; shopSlug: string; coverUrl: string; priceAmount: number; currency: string; durationMinutes: number;
  categories: string[]; rating?: { average: number; count: number };
}

/** `count` items taken at random (every item has the same chance; Fisher-Yates). `random` is given so a test can fix it. */
export function pickRandom<T>(items: readonly T[], count: number, random: () => number = Math.random): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, Math.max(0, count));
}

/** Every ACTIVE workshop of every listed shop, as the showcase needs it (the title in `locale`, else in the language of its shop). */
export function showcaseCandidates(locale: Locale): ShowcaseWorkshop[] {
  return listedShops().flatMap((s) =>
    s.workshops.filter((w: Workshop) => w.status === "ACTIVE").map((w): ShowcaseWorkshop => ({
      id: w.id, title: pickLocalized(w.title, locale, s.shop.defaultLocale), shopName: s.shop.name, shopSlug: s.shop.slug, coverUrl: w.coverUrl, priceAmount: w.priceAmount, currency: w.currency,
      durationMinutes: w.durationMinutes, categories: w.categories ?? [], ...(w.rating ? { rating: w.rating } : {}),
    })),
  );
}

/** The workshops to show now: up to `count` at random. */
export const featuredWorkshops = (locale: Locale, count = 10, random: () => number = Math.random): ShowcaseWorkshop[] => pickRandom(showcaseCandidates(locale), count, random);
