import type { SessionStatus, WorkshopStatus } from "./enums";

// What the shop owner can do with a workshop of the list (FR-WS-01). A workshop is Active (shown on the landing page, bookable) or deactivated
// (a draft). Archived workshops are out of the picture: they are not switched on or off and not edited.

/** A draft workshop can be activated. */
export const canActivateWorkshop = (status: WorkshopStatus): boolean => status === "DRAFT";

/** An active workshop can be deactivated, but only once every one of its sessions is Closed (no session still to come, running or paused). */
export const canDeactivateWorkshop = (status: WorkshopStatus, sessionStatuses: readonly SessionStatus[]): boolean =>
  status === "ACTIVE" && openSessionCount(sessionStatuses) === 0;

/** How many of the sessions are not Closed yet. */
export const openSessionCount = (sessionStatuses: readonly SessionStatus[]): number => sessionStatuses.filter((s) => s !== "CLOSED").length;

/** Only a deactivated (draft) workshop can be edited. */
export const canEditWorkshop = (status: WorkshopStatus): boolean => status === "DRAFT";

/** Why a workshop cannot be switched on or off now, or null when it can: `STATUS` (archived, or already in that state) or `SESSIONS_OPEN`. */
export function checkWorkshopSwitch(status: WorkshopStatus, to: "ACTIVE" | "DRAFT", sessionStatuses: readonly SessionStatus[]): null | "STATUS" | "SESSIONS_OPEN" {
  if (to === "ACTIVE") return canActivateWorkshop(status) ? null : "STATUS";
  if (status !== "ACTIVE") return "STATUS";
  return canDeactivateWorkshop(status, sessionStatuses) ? null : "SESSIONS_OPEN";
}
