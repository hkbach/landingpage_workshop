import type { PageContent, PageTheme } from "@/lib/types";
import type { TemplateKey } from "@/components/sections/templates";

// Frontend-only "autosave": the draft lives in localStorage until the API exists (PUT draft_content).
export interface Draft { content: PageContent; theme: PageTheme; template: TemplateKey }

export const DRAFT_KEY = "builder:draft:v1";

export function parseDraft(raw: string | null): Draft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Draft;
    if (d?.content?.schemaVersion === 1 && Array.isArray(d.content.sections) && d.theme && typeof d.theme.primary === "string") return d;
  } catch {
    /* ignore corrupt draft */
  }
  return null;
}

export function loadDraft(): Draft | null {
  return parseDraft(window.localStorage.getItem(DRAFT_KEY));
}

export function saveDraft(draft: Draft): void {
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
}
