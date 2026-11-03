import type { BookingStatus } from "@workshop/shared";

/**
 * Tells the mock backend that a booking changed status in the ops screens. Fire and forget: the screen already shows the change. A check-in sends the
 * time of the check-in and the status the booking had before it (the uncheck-in goes back to that status).
 */
export function persistBookingStatus(id: string, status: BookingStatus, cancelReason?: string, checkedInAt?: string, statusBeforeCheckIn?: "NOT_CONFIRMED" | "CONFIRMED"): void {
  void fetch(`/api/v1/bookings/${encodeURIComponent(id)}/status`, {
    method: "PATCH", headers: { "content-type": "application/json" },
    body: JSON.stringify({ status, ...(cancelReason ? { cancelReason } : {}), ...(checkedInAt ? { checkedInAt } : {}), ...(statusBeforeCheckIn ? { statusBeforeCheckIn } : {}) }),
  }).catch(() => undefined);
}
