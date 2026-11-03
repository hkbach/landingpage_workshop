import type { SessionCloseReason } from "@workshop/shared";

// Browser side of the session endpoints (/api/v1/sessions).

export interface RescheduleNotice {
  oldStartsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  reason: SessionCloseReason;
}

/** Tells the server a session was re-scheduled, so the guests who booked it are emailed. Rejects when the server answers an error. */
export async function notifyRescheduleRequest(sessionId: string, notice: RescheduleNotice): Promise<{ notified: number; withoutEmail: number }> {
  const res = await fetch(`/api/v1/sessions/${encodeURIComponent(sessionId)}/reschedule`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(notice),
  });
  if (!res.ok) throw new Error(`reschedule ${res.status}`);
  return (await res.json()) as { notified: number; withoutEmail: number };
}
