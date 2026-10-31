import type { LayoutKey } from "@/lib/types";

// The 10 page layouts ("frames"). A template = one layout + palette + font + radius/density + default sections.
// Order here is irrelevant to the UI (the picker follows TEMPLATE_KEYS); the first entry is the fallback.
export const LAYOUT_KEYS = [
  "classic", "quicklinks", "sidebar", "bento", "bookingrail", "magazine", "cinematic", "floatingcards", "journey", "appstyle",
] as const satisfies readonly LayoutKey[];

export const DEFAULT_LAYOUT: LayoutKey = LAYOUT_KEYS[0];

export function isLayoutKey(v: unknown): v is LayoutKey {
  return typeof v === "string" && (LAYOUT_KEYS as readonly string[]).includes(v);
}

/** Layout to render: the stored one when valid, otherwise the default. Never throws on stale or invalid data. */
export function resolveLayout(v: unknown): LayoutKey {
  return isLayoutKey(v) ? v : DEFAULT_LAYOUT;
}
