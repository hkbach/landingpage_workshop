import type { OrgStatus } from "@workshop/shared";

export interface Prerequisite { key: "identity" | "hero" | "contact" | "workshop"; met: boolean }

export interface PublishInputs {
  status: OrgStatus;
  prerequisites: readonly Prerequisite[];
  /** Enabled sections that fail validation or colour contrast. */
  invalidSections: number;
  /** Theme colours fail the 4.5:1 contrast rule. */
  invalidTheme: boolean;
  /** The draft is still being saved after an edit: publishing now could miss the latest change. */
  saving?: boolean;
}

/**
 * What the publish control does for the current shop status (FR-SITE-04). Shared by the sticky header and the Publish card. There is no review: publishing makes the page public at
 * once. A shop that is not live yet (DRAFT) must first have the checklist complete; publishing then also makes the shop ACTIVE.
 */
export type PublishAction =
  | { kind: "publish"; disabled: boolean; reason: "saving" | "checklist" | "errors" | null }
  | { kind: "suspended" };

export function publishAction({ status, prerequisites, invalidSections, invalidTheme, saving = false }: PublishInputs): PublishAction {
  const blocked = invalidSections > 0 || invalidTheme;
  switch (status) {
    case "SUSPENDED": return { kind: "suspended" };
    case "ACTIVE":
      // "saving" comes first: it is momentary, the other reasons are shown once the save has finished.
      return saving ? { kind: "publish", disabled: true, reason: "saving" } : { kind: "publish", disabled: blocked, reason: blocked ? "errors" : null };
    default: {
      const allMet = prerequisites.every((p) => p.met);
      if (saving) return { kind: "publish", disabled: true, reason: "saving" };
      return { kind: "publish", disabled: !allMet || blocked, reason: !allMet ? "checklist" : blocked ? "errors" : null };
    }
  }
}
