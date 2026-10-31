import type { Locale } from "@workshop/shared";

// Messages are split per area (messages/<locale>/<area>.json) so areas can be built independently.
// Missing keys in vi/ko/ja fall back to English.
const AREAS = ["common", "marketing", "auth", "dashboard", "admin", "site"] as const;

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

export async function loadMessages(locale: Locale): Promise<Record<string, unknown>> {
  const load = async (l: string) =>
    Object.fromEntries(await Promise.all(AREAS.map(async (a) => [a, await loadArea(l, a)] as const)));
  const en = await load("en");
  return locale === "en" ? en : deepMerge(en, await load(locale));
}
