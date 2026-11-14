import { pickLocalized, type Locale } from "@workshop/shared";
import { apiGet } from "@/lib/api-server";

// The workshops the home page of the platform shows: a random pick of the ACTIVE workshops of the shops the platform lists (`GET /public/workshops/featured`, public).

export interface ShowcaseWorkshop {
  id: string; title: string; shopName: string; shopSlug: string; coverUrl: string; priceAmount: number; currency: string; durationMinutes: number;
  categories: string[]; rating?: { average: number; count: number };
}

type ApiFeatured = { items: Array<Omit<ShowcaseWorkshop, "title" | "rating"> & { title: Record<string, string>; defaultLocale: Locale; rating: { average: number | null; count: number } }> };

/** Up to `count` workshops, the title in `locale` (else in the language of its shop). An unreachable API gives none: the home page then says there is nothing to show yet. */
export async function featuredWorkshops(locale: Locale, count = 10): Promise<ShowcaseWorkshop[]> {
  const res = await apiGet<ApiFeatured>(`/public/workshops/featured?limit=${count}`).catch(() => null);
  return (res?.items ?? []).map(({ title, defaultLocale, rating, ...rest }) => ({ ...rest, title: pickLocalized(title, locale, defaultLocale), ...(rating.average !== null ? { rating: { average: rating.average, count: rating.count } } : {}) }));
}
