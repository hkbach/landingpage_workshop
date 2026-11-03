// Sorting of a table by the click on its headers: a column goes ascending, then descending, then back to the order the table came in.

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;

/** The sort after a click on the header of `key`: a new column starts ascending, the same column goes ascending → descending → no sort. */
export function nextSort(state: SortState, key: string): SortState {
  if (!state || state.key !== key) return { key, dir: "asc" };
  return state.dir === "asc" ? { key, dir: "desc" } : null;
}

/** What a cell is sorted by: a number, a text, or nothing (null / undefined: the row goes last whatever the direction). */
export type SortValue = string | number | null | undefined;

/**
 * The rows in the order of the sort (a copy). Texts are compared by the language of the page with numbers inside them as numbers ("SES-0002" before
 * "SES-0010"), accents and case aside; rows with no value go last in both directions; rows that tie keep the order they came in.
 */
export function sortRows<T>(rows: readonly T[], state: SortState, value: (row: T, key: string) => SortValue, locale: string): T[] {
  if (!state) return [...rows];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const sign = state.dir === "asc" ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, v: value(row, state.key) }))
    .sort((a, b) => {
      const aNone = a.v === null || a.v === undefined || a.v === "";
      const bNone = b.v === null || b.v === undefined || b.v === "";
      if (aNone || bNone) return aNone === bNone ? a.index - b.index : aNone ? 1 : -1;
      const c = typeof a.v === "number" && typeof b.v === "number" ? a.v - b.v : collator.compare(String(a.v), String(b.v));
      return c !== 0 ? c * sign : a.index - b.index;
    })
    .map((x) => x.row);
}

/** The `aria-sort` value of a header. */
export const ariaSort = (state: SortState, key: string): "ascending" | "descending" | "none" =>
  state?.key === key ? (state.dir === "asc" ? "ascending" : "descending") : "none";
