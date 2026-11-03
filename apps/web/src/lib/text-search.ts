/**
 * A text made ready for a search box: trimmed, lower case, without accents (so "lam gom" finds "Làm gốm"), "đ" written "d", spaces squeezed.
 * Both what is typed and what is searched go through it.
 */
export function normalizeSearch(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/gi, "d").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Whether `text` contains what was typed (an empty search matches everything). */
export const matchesSearch = (text: string, typed: string): boolean => {
  const q = normalizeSearch(typed);
  return q === "" || normalizeSearch(text).includes(q);
};
