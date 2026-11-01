import type { BookingStatus } from "@workshop/shared";

/** Tells the mock backend that a booking changed status in the ops screens. Fire and forget: the screen already shows the change. */
export function persistBookingStatus(id: string, status: BookingStatus, cancelReason?: string): void {
  void fetch(`/api/v1/bookings/${encodeURIComponent(id)}/status`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, ...(cancelReason ? { cancelReason } : {}) }),
  }).catch(() => undefined);
}
