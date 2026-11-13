import type { Locale } from "@workshop/shared";
import { apiGet, realApi } from "@/lib/api-server";
import { legalFor } from "@/lib/mock/legal-store";

/** What a public page shows of the Terms or the Privacy Policy: the text in the language asked for, else the English one; `null` while nothing is published (the page then says it is coming). */
export type PublicLegal = { content: string; locale: Locale; version: number; updatedAt: string };

type ApiLegal = { available: false } | { available: true; locale: Locale; version: number; updatedAt: string; content: string };

export async function loadLegal(kind: "terms" | "privacy", locale: Locale): Promise<PublicLegal | null> {
  if (!realApi()) return legalFor(kind, locale);
  const doc = await apiGet<ApiLegal>(`/public/legal/${kind}?locale=${encodeURIComponent(locale)}`);
  return doc?.available ? { content: doc.content, locale: doc.locale, version: doc.version, updatedAt: doc.updatedAt } : null;
}
