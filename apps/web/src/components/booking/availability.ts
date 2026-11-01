import type { Session } from "@/lib/types";

/** Why a session cannot be chosen in the booking form ("OK" when it can). The order is the order of the checks. */
export type SlotState = "OK" | "PAST" | "CLOSED" | "CUTOFF" | "FULL";

/**
 * A session is bookable when it is open, starts after now + the shop's booking cut-off and still has a free spot (FR-BOOK-01).
 * Cancelled sessions are never offered, so they are not handled here.
 */
export function slotState(s: Pick<Session, "status" | "startsAt" | "capacity" | "reservedCount">, nowMs: number, cutoffMinutes: number): SlotState {
  const start = new Date(s.startsAt).getTime();
  if (start <= nowMs) return "PAST";
  if (s.status !== "OPEN") return "CLOSED";
  if (start <= nowMs + cutoffMinutes * 60_000) return "CUTOFF";
  if (s.capacity - s.reservedCount <= 0) return "FULL";
  return "OK";
}
