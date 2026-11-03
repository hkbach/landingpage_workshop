import { isSessionBookable } from "@workshop/shared";
import type { Session } from "@/lib/types";

/** Why a session cannot be chosen in the booking form ("OK" when it can). The order is the order of the checks. */
export type SlotState = "OK" | "PAST" | "CLOSED" | "CUTOFF" | "FULL";

/**
 * A session is bookable when it is running, starts after now + its own booking cut-off and still has a free spot (FR-BOOK-01).
 * Cancelled sessions are never offered, so they are not handled here.
 */
export function slotState(s: Pick<Session, "status" | "startsAt" | "capacity" | "reservedCount" | "bookingCutoffMinutes">, nowMs: number): SlotState {
  const start = new Date(s.startsAt).getTime();
  if (start <= nowMs) return "PAST";
  if (!isSessionBookable(s.status)) return "CLOSED";
  if (start <= nowMs + s.bookingCutoffMinutes * 60_000) return "CUTOFF";
  if (s.capacity - s.reservedCount <= 0) return "FULL";
  return "OK";
}
