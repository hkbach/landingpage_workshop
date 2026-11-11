// SERVER-ONLY: the status the shop owner gives to each workshop (Activate / Deactivate in the workshop list), until apps/api exists. The workshop
// list, the workshop page and the landing page read the workshops through `withWorkshopStatus`, so a change shows everywhere on the next load.
// Lives on globalThis like the other mock stores. TODO(api): organization_id from the session, OWNER / MANAGER only, audited; the backend checks the
// sessions in the same transaction as the status change.
import { withRating } from "./rating-store";
import { checkWorkshopSwitch, closeIfEnded, openSessionCount, type SessionStatus, type WorkshopStatus } from "@workshop/shared";
import type { Workshop } from "@/lib/types";
import { sessions, workshops } from "./data";
import { withAdminChanges } from "./session-admin-store";

const g = globalThis as unknown as { __workshopStatus?: Map<string, WorkshopStatus> };
const changed = () => (g.__workshopStatus ??= new Map<string, WorkshopStatus>());

/** Test helper: every workshop back to the status it has in the demo data. */
export function resetWorkshopStatusStore(): void {
  g.__workshopStatus = new Map();
}

/** The workshops with the status the shop owner gave them. */
export function withWorkshopStatus<T extends Workshop>(list: readonly T[]): T[] {
  return list.map((w) => withRating(changed().has(w.id) ? { ...w, status: changed().get(w.id)! } : w)); // the rating counts what the guests gave
}

/** The status of every session of a workshop as the shop sees it now (a session whose time is over is Closed; an administrator's changes count). */
export function workshopSessionStatuses(workshopId: string, now: Date = new Date()): SessionStatus[] {
  return withAdminChanges(sessions).filter((s) => s.workshopId === workshopId).map((s) => closeIfEnded(s, now).status);
}

export type SwitchResult =
  | { ok: true; workshop: Workshop }
  | { ok: false; code: "NOT_FOUND" | "STATUS" } | { ok: false; code: "SESSIONS_OPEN"; open: number };

/** Activates (to ACTIVE) or deactivates (to DRAFT) a workshop. Deactivating needs every session of the workshop to be Closed. */
export function switchWorkshop(id: string, to: "ACTIVE" | "DRAFT", now: Date = new Date()): SwitchResult {
  const base = workshops.find((w) => w.id === id);
  if (!base) return { ok: false, code: "NOT_FOUND" };
  const current = withWorkshopStatus([base])[0]!;
  const states = workshopSessionStatuses(id, now);
  const why = checkWorkshopSwitch(current.status, to, states);
  if (why === "SESSIONS_OPEN") return { ok: false, code: "SESSIONS_OPEN", open: openSessionCount(states) };
  if (why) return { ok: false, code: why };
  changed().set(id, to);
  return { ok: true, workshop: { ...base, status: to } };
}
