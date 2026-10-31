/** Format an ISO UTC instant in a given IANA timezone (BR-15). No extra dependency. */
export function formatDateTime(iso: string, timeZone: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}
export function formatDate(iso: string, timeZone: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(new Date(iso));
}
export function formatTime(iso: string, timeZone: string, locale = "en"): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short", timeZone }).format(new Date(iso));
}
/** yyyy-mm-dd of an instant in the shop timezone. */
export function dayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date(iso));
}
