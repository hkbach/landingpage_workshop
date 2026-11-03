import type { SessionCloseReason } from "@workshop/shared";

// Browser side of the session endpoints (/api/v1/sessions).

export interface RescheduleNotice {
  oldStartsAt: string;
  newStartsAt: string;
  newEndsAt: string;
  reason: SessionCloseReason;
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return (await res.json()) as T;
}

/** Tells the server a session was re-scheduled, so the guests who booked it (but did not cancel) are emailed. Rejects when the server answers an error. */
export function notifyRescheduleRequest(sessionId: string, notice: RescheduleNotice): Promise<{ notified: number; withoutEmail: number }> {
  return post(`/api/v1/sessions/${encodeURIComponent(sessionId)}/reschedule`, notice);
}

/** Tells the server the owner closed a session, so the guests who booked it (but did not cancel) are emailed. */
export function notifyClosedRequest(sessionId: string, notice: { startsAt: string; endsAt: string; reason: SessionCloseReason }): Promise<{ notified: number; withoutEmail: number }> {
  return post(`/api/v1/sessions/${encodeURIComponent(sessionId)}/closed`, notice);
}

/** Tells the server which sessions the system closed because their time ended; each session is mailed once, whatever the number of calls. */
export function notifyAutoClosedRequest(sessions: readonly { id: string; startsAt: string; endsAt: string }[]): Promise<{ mailed: { id: string; notified: number }[] }> {
  return post("/api/v1/sessions/auto-closed", { sessions });
}
