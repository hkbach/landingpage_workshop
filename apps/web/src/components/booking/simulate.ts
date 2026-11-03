import { nextBookingCode } from "@workshop/shared";

// Frontend-only simulation of POST /public/sites/{slug}/bookings (no API in this milestone).
// The real backend recomputes price, checks capacity (SessionCapacityService) and verifies Turnstile.
export interface ConfirmationData {
  code: string;
  email: string;
  workshopTitle: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  quantity: number;
  /** Price after the promotions the guest used. */
  totalAmount: number;
  currency: string;
  /** Titles of the promotions used and what they took off (display only; the backend recomputes). */
  promotions?: string[];
  discountAmount?: number;
}

const SEQ_PREFIX = "bkseq:";
const KEY_PREFIX = "booking:";
const IDEM_PREFIX = "idem:";

/**
 * "<session code>-<3 digits>": the digits count the bookings of the session. The mock does not know the bookings made elsewhere, so it starts after
 * the seats already reserved (there are never more bookings than seats) and after the codes this browser already gave.
 */
function newCode(session: { id: string; code: string; reservedCount: number }): string {
  const last = Number(sessionStorage.getItem(SEQ_PREFIX + session.id) ?? 0);
  const code = nextBookingCode(session.code, [], Math.max(session.reservedCount, last) + 1);
  sessionStorage.setItem(SEQ_PREFIX + session.id, String(Number(code.slice(session.code.length + 1))));
  return code;
}

export async function simulateBooking(data: Omit<ConfirmationData, "code">, idempotencyKey: string, session: { id: string; code: string; reservedCount: number }): Promise<ConfirmationData> {
  await new Promise((r) => setTimeout(r, 600));
  // Same Idempotency-Key returns the same booking (FR-BOOK-02).
  const existing = sessionStorage.getItem(IDEM_PREFIX + idempotencyKey);
  const code = existing ?? newCode(session);
  const result: ConfirmationData = { ...data, code };
  sessionStorage.setItem(IDEM_PREFIX + idempotencyKey, code);
  sessionStorage.setItem(KEY_PREFIX + code, JSON.stringify(result));
  return result;
}

export function readSimulatedBooking(code: string): string | null {
  return sessionStorage.getItem(KEY_PREFIX + code);
}
