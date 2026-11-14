import type { Locale } from "@workshop/shared";

// Messages are split per area (messages/<locale>/<area>.json) so areas can be built independently.
// Every locale must have every key (messages-parity.test.ts); the English fallback is only a safety net for a key missed in production.
const AREAS = ["common", "marketing", "auth", "dashboard", "ops", "catalog", "builder", "site", "admin", "customer"] as const;

async function loadArea(locale: string, area: string): Promise<Record<string, unknown>> {
  try {
    return (await import(`../../messages/${locale}/${area}.json`)).default;
  } catch {
    return {};
  }
}

function deepMerge(base: Record<string, unknown>, over: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] =
      v && typeof v === "object" && !Array.isArray(v) && b && typeof b === "object"
        ? deepMerge(b as Record<string, unknown>, v as Record<string, unknown>)
        : v;
  }
  return out;
}

// The merged catalogue of a locale never changes while the server runs: it is built once per locale (it was merged again at every request, and once per language in the preview).
const merged = new Map<Locale, Promise<Record<string, unknown>>>();

async function build(locale: Locale): Promise<Record<string, unknown>> {
  const load = async (l: string) =>
    Object.fromEntries(await Promise.all(AREAS.map(async (a) => [a, await loadArea(l, a)] as const)));
  const en = await load("en");
  return locale === "en" ? en : deepMerge(en, await load(locale));
}

export function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  if (process.env.NODE_ENV !== "production") return build(locale); // (in development an edited message file must show at once)
  let found = merged.get(locale);
  if (!found) {
    found = build(locale);
    found.catch(() => merged.delete(locale)); // (a failed load is tried again next time)
    merged.set(locale, found);
  }
  return found;
}
