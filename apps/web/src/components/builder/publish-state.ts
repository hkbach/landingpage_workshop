import type { OrgStatus } from "@workshop/shared";

export interface Prerequisite { key: "identity" | "hero" | "contact" | "workshop"; met: boolean }

export interface PublishInputs {
  status: OrgStatus;
  prerequisites: readonly Prerequisite[];
  /** Enabled sections that fail validation or colour contrast. */
  invalidSections: number;
  /** Theme colours fail the 4.5:1 contrast rule. */
  invalidTheme: boolean;
}

/** What the publish control does for the current shop status (FR-SITE-04). Shared by the sticky header and the Publish card. */
export type PublishAction =
  /** Shop already live: publish the draft immediately. */
  | { kind: "publish"; disabled: boolean; reason: "errors" | null }
  /** First time: submit for admin review once the checklist is complete. */
  | { kind: "submit"; disabled: boolean; reason: "checklist" | "errors" | null }
  | { kind: "pending" }
  | { kind: "suspended" };

export function publishAction({ status, prerequisites, invalidSections, invalidTheme }: PublishInputs): PublishAction {
  const blocked = invalidSections > 0 || invalidTheme;
  switch (status) {
    case "SUSPENDED": return { kind: "suspended" };
    case "PENDING_REVIEW": return { kind: "pending" };
    case "ACTIVE": return { kind: "publish", disabled: blocked, reason: blocked ? "errors" : null };
    default: {
      const allMet = prerequisites.every((p) => p.met);
      return { kind: "submit", disabled: !allMet || blocked, reason: !allMet ? "checklist" : blocked ? "errors" : null };
    }
  }
}
