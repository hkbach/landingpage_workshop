import {
  dateToOccurredAt, FINANCE_TYPES, isRealDate, manualCategories, type FinanceEntry, type FinanceEntryInput, type FinanceType,
} from "@workshop/shared";

// Frontend-only stand-in for the finance_entries table: the entries the shop owner types live in localStorage until the API exists.
export const FINANCE_KEY = "finance:manual:v1";

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Rebuilds the list from untrusted stored JSON: rows that are not valid manual entries are dropped. Null when it is not a list. */
export function parseEntries(raw: string | null, currency: string): FinanceEntry[] | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const seen = new Set<string>();
    const out: FinanceEntry[] = [];
    for (const r of data) {
      if (!isObj(r) || typeof r.id !== "string" || !r.id || seen.has(r.id)) continue;
      const type = FINANCE_TYPES.find((t) => t === r.type);
      const amount = r.amount;
      const occurredAt = typeof r.occurredAt === "string" ? r.occurredAt : "";
      if (!type || typeof r.category !== "string" || !(manualCategories(type) as readonly string[]).includes(r.category)) continue;
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0 || !isRealDate(occurredAt.slice(0, 10))) continue;
      seen.add(r.id);
      out.push({
        id: r.id, type, category: r.category as FinanceEntry["category"], amount, currency, occurredAt, source: "MANUAL",
        ...(typeof r.note === "string" && r.note ? { note: r.note.slice(0, 200) } : {}),
      });
    }
    return out;
  } catch {
    return null;
  }
}

/** The saved entries; a shop that never saved any starts with the seed (mock data). An empty saved list stays empty. */
export function loadManualEntries(seed: FinanceEntry[], currency: string): FinanceEntry[] {
  try { return parseEntries(window.localStorage.getItem(FINANCE_KEY), currency) ?? seed; } catch { return seed; }
}

export function saveManualEntries(entries: FinanceEntry[]): boolean {
  try { window.localStorage.setItem(FINANCE_KEY, JSON.stringify(entries)); return true; } catch { return false; }
}

const toEntry = (input: FinanceEntryInput, id: string, currency: string): FinanceEntry => ({
  id, type: input.type as FinanceType, category: input.category as FinanceEntry["category"], amount: input.amount, currency,
  occurredAt: dateToOccurredAt(input.date), source: "MANUAL", ...(input.note ? { note: input.note } : {}),
});

export const addEntry = (entries: readonly FinanceEntry[], input: FinanceEntryInput, ctx: { id: string; currency: string }): FinanceEntry[] =>
  [...entries, toEntry(input, ctx.id, ctx.currency)];

/** Only manual entries can change; an unknown id leaves the list as it is. */
export const updateEntry = (entries: readonly FinanceEntry[], id: string, input: FinanceEntryInput, currency: string): FinanceEntry[] =>
  entries.map((e) => (e.id === id && e.source === "MANUAL" ? toEntry(input, id, currency) : e));

export const removeEntry = (entries: readonly FinanceEntry[], id: string): FinanceEntry[] => entries.filter((e) => e.id !== id);

/** Amount typed in major units ("1,500.50" or "1500") to minor units; null when it is not a positive number. */
export function parseAmount(text: string, digits: number): number | null {
  const s = text.trim().replace(/[\s,]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [, frac = ""] = s.split(".");
  if (frac.length > digits) return null;
  const minor = Math.round(Number(s) * 10 ** digits);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
