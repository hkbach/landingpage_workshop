// SERVER-ONLY: what a system administrator did to the sessions of the demo shop (close or open, without the limits of the owner), until apps/api
// exists. The shop owner's pages and the landing page read the sessions through `withAdminChanges`, so the change shows up there on the next
// load. Lives on globalThis like the other mock stores. TODO(api): SUPER_ADMIN only, audited; the real backend writes the status and the note of
// the session itself.
import { canAdminClose, canAdminReopen, closeIfEnded, withNote, type SessionNote } from "@workshop/shared";
import type { Session } from "@/lib/types";
import { sessions as seed } from "./data";

interface Change { action: "close" | "reopen"; note: SessionNote }
const g = globalThis as unknown as { __sessionAdmin?: Map<string, Change[]> };
const changes = () => (g.__sessionAdmin ??= new Map<string, Change[]>());

/** Test helper: no change of an administrator. */
export function resetSessionAdminStore(): void {
  g.__sessionAdmin = new Map();
}

/** The sessions as they are once the changes of the administrators are applied (closed or open again, with their notes). */
export function withAdminChanges<T extends Session>(list: readonly T[]): T[] {
  return list.map((s) => {
    const done = changes().get(s.id);
    if (!done?.length) return s;
    const last = done[done.length - 1]!;
    let notes = s.notes;
    for (const c of done) notes = withNote(notes, c.note);
    return { ...s, status: last.action === "close" ? "CLOSED" : "OPEN", notes } as T;
  });
}

export type AdminSessionResult = { ok: true; session: Session } | { ok: false; code: "NOT_FOUND" | "NOT_ALLOWED" | "REASON_REQUIRED" };

/** An administrator closes (with a reason) or opens a session. Not limited by the 3 re-schedules and 4 closes of the owner. */
export function adminChangeSession(id: string, action: "close" | "reopen", reason: string, now: Date = new Date()): AdminSessionResult {
  if (!seed.some((s) => s.id === id)) return { ok: false, code: "NOT_FOUND" };
  const current = closeIfEnded(withAdminChanges(seed).find((s) => s.id === id)!, now);
  const text = reason.trim();
  if (action === "close") {
    if (!canAdminClose(current)) return { ok: false, code: "NOT_ALLOWED" };
    if (!text) return { ok: false, code: "REASON_REQUIRED" };
  } else if (!canAdminReopen(current, now)) {
    return { ok: false, code: "NOT_ALLOWED" };
  }
  const note: SessionNote = action === "close"
    ? { type: "CLOSED", at: now.toISOString(), by: "ADMIN", reason: { code: "OTHER", note: text.slice(0, 300) } }
    : { type: "REOPENED", at: now.toISOString(), by: "ADMIN" };
  changes().set(id, [...(changes().get(id) ?? []), { action, note }]);
  return { ok: true, session: closeIfEnded(withAdminChanges(seed).find((s) => s.id === id)!, now) };
}
