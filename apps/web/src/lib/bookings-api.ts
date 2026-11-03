import type { BookingStatus } from "@workshop/shared";

/**
 * Tells the mock backend that a booking changed status in the ops screens. Fire and forget: the screen already shows the change. A check-in sends the
 * time of the check-in and the status the booking had before it (the uncheck-in goes back to that status).
 */
/** Tells the server a booking became Paid, so the guest is emailed that the payment was received. `notified` is 0 when the guest left no email. Rejects on an error. */
export async function notifyPaidRequest(id: string): Promise<{ notified: number }> {
  const res = await fetch(`/api/v1/bookings/${encodeURIComponent(id)}/paid`, { method: "POST" });
  if (!res.ok) throw new Error(`paid ${res.status}`);
  return (await res.json()) as { notified: number };
}

/** Tells the mock backend a booking was set Paid or Unpaid (so the Income page counts it). Fire and forget: the screen already shows the change. */
export function persistPaid(id: string, paid: boolean): void {
  void fetch(`/api/v1/bookings/${encodeURIComponent(id)}/payment`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ paid }),
  }).catch(() => undefined);
}

export function persistBookingStatus(id: string, status: BookingStatus, cancelReason?: string, checkedInAt?: string, statusBeforeCheckIn?: "NOT_CONFIRMED" | "CONFIRMED"): void {
  void fetch(`/api/v1/bookings/${encodeURIComponent(id)}/status`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, ...(cancelReason ? { cancelReason } : {}), ...(checkedInAt ? { checkedInAt } : {}), ...(statusBeforeCheckIn ? { statusBeforeCheckIn } : {}) }),
  }).catch(() => undefined);
}
