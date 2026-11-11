// SERVER-ONLY: the text of the Terms of Service and of the Privacy Policy, written by the administrators in each language (Legal of the admin area) and shown on the public pages /terms and
// /privacy, until apps/api exists. Lives on globalThis like the other mock stores. The text is plain: a blank line starts a paragraph, a line that starts with "# " is a heading and one that
// starts with "- " is a list item (see components/marketing/legal-document.tsx); nothing in it is ever treated as HTML.
// TODO(api): `legal_documents` (kind, locale, content, version), the history of versions with who changed what and when, the text approved by the legal team before it is published.
import { LOCALES, type Locale } from "@workshop/shared";

export const LEGAL_KINDS = ["terms", "privacy"] as const;
export type LegalKind = (typeof LEGAL_KINDS)[number];
export const LEGAL_MAX_CHARS = 50_000;

export interface LegalDocument { kind: LegalKind; content: Partial<Record<Locale, string>>; version: number; updatedAt: string; updatedBy: string }

const g = globalThis as unknown as { __legal?: Map<LegalKind, LegalDocument> };
const docs = () => (g.__legal ??= new Map<LegalKind, LegalDocument>());

/** Test helper: no text written yet. */
export function resetLegalStore(): void {
  g.__legal = new Map();
}

export const isLegalKind = (v: string): v is LegalKind => (LEGAL_KINDS as readonly string[]).includes(v);

/** The document (an empty one with version 0 when nobody wrote it yet). */
export function getLegal(kind: LegalKind): LegalDocument {
  const d = docs().get(kind);
  return d ? { ...d, content: { ...d.content } } : { kind, content: {}, version: 0, updatedAt: "", updatedBy: "" };
}

export type SetLegalResult = { ok: true; document: LegalDocument; changed: boolean } | { ok: false; code: "INVALID_LOCALE" | "TOO_LONG" };

/** Saves the text of one language (trimmed; an empty text removes the language). The version goes up only when the text changed. */
export function setLegalContent(kind: LegalKind, locale: string, content: string, by: string, now = new Date()): SetLegalResult {
  if (!(LOCALES as readonly string[]).includes(locale)) return { ok: false, code: "INVALID_LOCALE" };
  const text = content.replace(/\r\n/g, "\n").trim();
  if (text.length > LEGAL_MAX_CHARS) return { ok: false, code: "TOO_LONG" };
  const before = getLegal(kind);
  const l = locale as Locale;
  if ((before.content[l] ?? "") === text) return { ok: true, document: before, changed: false };
  const next: LegalDocument = { ...before, content: { ...before.content }, version: before.version + 1, updatedAt: now.toISOString(), updatedBy: by };
  if (text) next.content[l] = text; else delete next.content[l];
  docs().set(kind, next);
  return { ok: true, document: getLegal(kind), changed: true };
}

/** What the public page shows for a language: its own text, else the English one, else the text of any language; null when nothing was written (the page then says it is coming). */
export function legalFor(kind: LegalKind, locale: Locale): { content: string; locale: Locale; version: number; updatedAt: string } | null {
  const d = getLegal(kind);
  const found = (d.content[locale] ? locale : d.content.en ? "en" : LOCALES.find((l) => d.content[l])) as Locale | undefined;
  return found ? { content: d.content[found]!, locale: found, version: d.version, updatedAt: d.updatedAt } : null;
}
