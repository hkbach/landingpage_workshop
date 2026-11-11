// Which message areas (messages/<locale>/<area>.json) each part of the app sends to the BROWSER.
//
// Server components read the full catalogue on the server and never ship it. Client components only get what their
// provider passes, so each area wraps its pages with just the areas it needs. This keeps pages small and keeps the UI text
// of the shop owner tools and the admin area out of the public landing page and the other areas.
//
// The public site is not listed: it has its own provider (components/site/SiteIntlProvider) that sends only `site`,
// in the language of the visitor.
export const AREA_MESSAGES = {
  marketing: ["common", "marketing", "auth"], // the popups Log in and Sign up are on the public site
  auth: ["common", "auth"],
  shopowner: ["common", "dashboard", "ops", "catalog", "builder"],
  admin: ["common", "admin"],
  // The guest area: its own texts, and the login of the site (the guest logs in with the same popup form as on the landing page).
  customer: ["common", "customer", "site"],
} as const;

export type MessageArea = keyof typeof AREA_MESSAGES;

/** The requested areas of a message catalogue (areas the catalogue does not have are skipped). */
export function pickAreas(messages: Record<string, unknown>, areas: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(areas.filter((a) => a in messages).map((a) => [a, messages[a]]));
}
