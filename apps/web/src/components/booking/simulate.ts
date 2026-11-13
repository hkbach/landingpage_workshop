import type { BookingStatus, Locale } from "@workshop/shared";
import { readAffiliateCode } from "@/lib/affiliate";

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
  /** When it is CANCELLED: who cancelled it and why. */
  cancelledBy?: "SHOP" | "GUEST";
  cancelReason?: string;
  /** Demo only: the link of the email, so the page can offer it (a real guest only gets it by email). */
  demoConfirmUrl?: string;
  /** Demo only: the page that shows the email as it arrived (six languages), since the prototype has no mailbox. */
  demoEmailUrl?: string;
}

/** Why the server refused the booking: the seats were taken (FULL) or the session closed (GONE) meanwhile, or something else went wrong. */
export class BookingRefused extends Error {
  constructor(readonly reason: "GONE" | "FULL" | "OTP_WRONG" | "OTP_LOCKED" | "OTHER") { super(reason); }
}

export interface BookingRequest {
  slug: string; sessionId: string; quantity: number; fullName: string; email: string; country: string; phone: string; specialRequest?: string;
  promotionIds: string[]; locale: Locale; /** The 6 digits the guest received by email. */ otp: string;
}

const KEY_PREFIX = "booking:";

/**
 * Makes the booking on the server (the same Idempotency-Key gives the same booking, FR-BOOK-02) and returns what the confirmation page shows. The
 * booking is NOT_CONFIRMED: the guest gets an email with the link that confirms it.
 */
export async function submitBooking(req: BookingRequest, display: Omit<ConfirmationData, "code" | "status" | "demoConfirmUrl">, idempotencyKey: string): Promise<ConfirmationData> {
  const { slug, fullName, email, country, phone, specialRequest, ...rest } = req;
  const ref = readAffiliateCode(slug);
  // The shape of the API: the guest in its own object, the agreement to the policy (the form does not go on without it), the code of the email. The price is never sent: the server works it out.
  const body = { ...rest, guest: { fullName, email, country, phone, ...(specialRequest ? { specialRequest } : {}) }, consent: true, ...(ref ? { ref } : {}) };
  const res = await fetch(`/api/v1/public/sites/${encodeURIComponent(slug)}/bookings`, {
    method: "POST", headers: { "content-type": "application/json", "idempotency-key": idempotencyKey }, body: JSON.stringify(body),
  });
  if (!res.ok) {
    const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
    if (code === "OTP_INVALID") throw new BookingRefused("OTP_WRONG");
    if (code === "OTP_LOCKED") throw new BookingRefused("OTP_LOCKED");
    if (res.status === 409) throw new BookingRefused(code === "SESSION_FULL" ? "FULL" : "GONE");
    throw new BookingRefused("OTHER");
  }
  const made = (await res.json()) as { code: string; status: BookingStatus; totalAmount: number; demoConfirmUrl?: string };
  const result: ConfirmationData = { ...display, code: made.code, status: made.status, totalAmount: made.totalAmount, ...(made.demoConfirmUrl ? { demoConfirmUrl: made.demoConfirmUrl } : {}) };
  sessionStorage.setItem(KEY_PREFIX + made.code, JSON.stringify(result));
  return result;
}

export function readSimulatedBooking(code: string): string | null {
  return sessionStorage.getItem(KEY_PREFIX + code);
}
