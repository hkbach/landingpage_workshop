import type { BookingStatus, Locale } from "@workshop/shared";

// The guest books through POST /api/v1/public/sites/{slug}/bookings (a mock inside Next until apps/api exists). The server makes the booking NOT_CONFIRMED,
// recomputes the price, checks the seats (SessionCapacityService) and queues the email with the link that confirms it. This file keeps what the
// confirmation page shows in sessionStorage, as a fallback when the server does not know the booking.
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
  /** NOT_CONFIRMED until the guest opens the link of the email. */
  status?: BookingStatus;
  /** Demo only: the link of the email, so the page can offer it (a real guest only gets it by email). */
  demoConfirmUrl?: string;
}

/** Why the server refused the booking: the session was filled or closed meanwhile, or something else went wrong. */
export class BookingRefused extends Error {
  constructor(readonly reason: "GONE" | "OTHER") { super(reason); }
}

export interface BookingRequest {
  slug: string; sessionId: string; quantity: number; fullName: string; email: string; phone?: string; specialRequest?: string;
  promotionIds: string[]; locale: Locale;
}

const KEY_PREFIX = "booking:";

/**
 * Makes the booking on the server (the same Idempotency-Key gives the same booking, FR-BOOK-02) and returns what the confirmation page shows. The
 * booking is NOT_CONFIRMED: the guest gets an email with the link that confirms it.
 */
export async function submitBooking(req: BookingRequest, display: Omit<ConfirmationData, "code" | "status" | "demoConfirmUrl">, idempotencyKey: string): Promise<ConfirmationData> {
  const { slug, ...body } = req;
  const res = await fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/bookings`, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify(body),
  });
  if (res.status === 409) throw new BookingRefused("GONE");
  if (!res.ok) throw new BookingRefused("OTHER");
  const made = (await res.json()) as { code: string; status: BookingStatus; totalAmount: number; demoConfirmUrl?: string };
  const result: ConfirmationData = { ...display, code: made.code, status: made.status, totalAmount: made.totalAmount, ...(made.demoConfirmUrl ? { demoConfirmUrl: made.demoConfirmUrl } : {}) };
  sessionStorage.setItem(KEY_PREFIX + made.code, JSON.stringify(result));
  return result;
}

export function readSimulatedBooking(code: string): string | null {
  return sessionStorage.getItem(KEY_PREFIX + code);
}
