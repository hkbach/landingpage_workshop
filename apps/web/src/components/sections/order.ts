import type { SectionType } from "@workshop/shared";
import type { SectionInstance } from "@/lib/types";

// Section order rules (FR-SITE-02): the hero is always the first section and the footer always the last.
// Both have a locked position; every section in between can be moved with drag and drop or the up/down buttons.

/** Types whose position the shop cannot change. */
export function isPositionLocked(type: SectionType): boolean {
  return type === "hero" || type === "footer";
}

/** Hero first, footer last, everything else in its current relative order. Idempotent and never mutates the input. */
export function normalizeOrder(sections: readonly SectionInstance[]): SectionInstance[] {
  const hero = sections.filter((s) => s.type === "hero");
  const footer = sections.filter((s) => s.type === "footer");
  const middle = sections.filter((s) => !isPositionLocked(s.type));
  return [...hero, ...middle, ...footer];
}

/** The sections between the hero and the footer: the only ones that can be moved. */
export function movableSections(sections: readonly SectionInstance[]): SectionInstance[] {
  return sections.filter((s) => !isPositionLocked(s.type));
}

/** Whether `id` can move one step in `direction` (-1 = up, 1 = down) without crossing the hero or the footer. */
export function canMove(sections: readonly SectionInstance[], id: string, direction: -1 | 1): boolean {
  const movable = movableSections(sections);
  const i = movable.findIndex((s) => s.id === id);
  if (i < 0) return false;
  const j = i + direction;
  return j >= 0 && j < movable.length;
}

/** Move a section one step up or down. A locked or unknown section, or a move past the edge, returns the list unchanged. */
export function moveSection(sections: readonly SectionInstance[], id: string, direction: -1 | 1): SectionInstance[] {
  if (!canMove(sections, id, direction)) return [...sections];
  const next = movableSections(sections);
  const i = next.findIndex((s) => s.id === id);
  [next[i], next[i + direction]] = [next[i + direction]!, next[i]!];
  return [...sections.filter((s) => s.type === "hero"), ...next, ...sections.filter((s) => s.type === "footer")];
}

/** 1-based position of a movable section among the movable ones, with the total (for screen reader announcements). */
export function movablePosition(sections: readonly SectionInstance[], id: string): { position: number; total: number } | null {
  const movable = movableSections(sections);
  const i = movable.findIndex((s) => s.id === id);
  return i < 0 ? null : { position: i + 1, total: movable.length };
}
