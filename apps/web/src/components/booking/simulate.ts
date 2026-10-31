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
  totalAmount: number;
  currency: string;
}

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const KEY_PREFIX = "booking:";
const IDEM_PREFIX = "idem:";

function newCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => CROCKFORD[b % 32]).join("");
}

export async function simulateBooking(data: Omit<ConfirmationData, "code">, idempotencyKey: string): Promise<ConfirmationData> {
  await new Promise((r) => setTimeout(r, 600));
  // Same Idempotency-Key returns the same booking (FR-BOOK-02).
  const existing = sessionStorage.getItem(IDEM_PREFIX + idempotencyKey);
  const code = existing ?? newCode();
  const result: ConfirmationData = { ...data, code };
  sessionStorage.setItem(IDEM_PREFIX + idempotencyKey, code);
  sessionStorage.setItem(KEY_PREFIX + code, JSON.stringify(result));
  return result;
}

export function readSimulatedBooking(code: string): string | null {
  return sessionStorage.getItem(KEY_PREFIX + code);
}
