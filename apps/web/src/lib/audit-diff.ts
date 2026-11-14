// What a line of the audit log changed, as a short list for the History tabs of the admin screens: each field that is different between `before` and `after`, with the two values written briefly.
// A field that holds a secret is never shown, and a long value is cut.

export interface FieldChange { field: string; before: string | null; after: string | null }

const HIDDEN = /password|token|secret|hash|cookie|signature|bank|iban|account_?number/i;
const MAX_VALUE = 80;
const MAX_DEPTH = 2;

function flatten(value: unknown, prefix: string, depth: number, out: Map<string, unknown>): void {
  if (value && typeof value === "object" && !Array.isArray(value) && depth < MAX_DEPTH) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, depth + 1, out);
    return;
  }
  out.set(prefix, value);
}

/** One value written briefly: text as it is, others as JSON, a long one cut with an ellipsis. `null` for a value that is not there. */
export function shortValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE - 1)}…` : text;
}

/** The fields that differ between two records (each may be missing: a creation has no `before`, a deletion no `after`). */
export function diffChanges(before: unknown, after: unknown): FieldChange[] {
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  if (before && typeof before === "object") flatten(before, "", 0, a); else if (before !== null && before !== undefined) a.set("value", before);
  if (after && typeof after === "object") flatten(after, "", 0, b); else if (after !== null && after !== undefined) b.set("value", after);
  const fields = [...new Set([...a.keys(), ...b.keys()])].filter((f) => f !== "");
  return fields.flatMap((field): FieldChange[] => {
    const x = a.get(field);
    const y = b.get(field);
    if (JSON.stringify(x) === JSON.stringify(y)) return [];
    if (HIDDEN.test(field)) return [{ field, before: x === undefined ? null : "•••", after: y === undefined ? null : "•••" }];
    return [{ field, before: shortValue(x), after: shortValue(y) }];
  });
}
