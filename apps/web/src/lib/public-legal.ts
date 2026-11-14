import type { Locale } from "@workshop/shared";
import { apiGet } from "@/lib/api-server";

/** What a public page shows of the Terms or the Privacy Policy: the text in the language asked for, else the English one; `null` while nothing is published (the page then says it is coming). */
export type PublicLegal = { content: string; locale: Locale; version: number; updatedAt: string };

type ApiLegal = { available: false } | { available: true; locale: Locale; version: number; updatedAt: string; content: string };

export async function loadLegal(kind: "terms" | "privacy", locale: Locale): Promise<PublicLegal | null> {
  const doc = await apiGet<ApiLegal>(`/public/legal/${kind}?locale=${encodeURIComponent(locale)}`);
  return doc?.available ? { content: doc.content, locale: doc.locale, version: doc.version, updatedAt: doc.updatedAt } : null;
}
