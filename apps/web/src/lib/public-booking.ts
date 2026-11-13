import { apiFetch } from "@/lib/api-server";
import type { BookingStatus, Localized } from "@workshop/shared";

// A guest looks at, confirms or cancels a booking with the code and the email (no account). Server side, connected to the API. The answers are the same for a wrong code and a wrong email.

export type GuestBooking = {
  code: string; status: BookingStatus; quantity: number; totalAmount: number; currency: string; guestName: string; /** The title in every language the shop wrote it in (what it was when the guest booked). */ workshopTitle: Localized;
  startsAt: string; endsAt: string; timezone: string; address: string; cancelReason: string | null; cancelledBy: string | null; canCancel: boolean;
};

/** `POST /public/sites/{slug}/bookings/lookup`: the booking, or `null` for anything that is not the guest's booking (and for a rate limit: the page then says "not found"). */
export async function lookupGuestBooking(slug: string, code: string, email: string): Promise<GuestBooking | null> {
  const res = await apiFetch(`/public/sites/${encodeURIComponent(slug)}/bookings/lookup`, { method: "POST", body: JSON.stringify({ code, email }) }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as GuestBooking;
}

/** `POST /public/bookings/confirm`: spends the token of the email. `already`: the booking was confirmed before. `invalid`: unknown or used-up link. `cancelled`: the booking was cancelled. */
export async function confirmGuestBooking(token: string): Promise<{ kind: "confirmed" | "already"; code: string } | { kind: "invalid" | "cancelled" }> {
  const res = await apiFetch("/public/bookings/confirm", { method: "POST", body: JSON.stringify({ token }) }).catch(() => null);
  if (!res) return { kind: "invalid" };
  if (res.ok) {
    const b = (await res.json()) as { code: string; changed: boolean };
    return { kind: b.changed ? "confirmed" : "already", code: b.code };
  }
  const code = ((await res.json().catch(() => null)) as { error?: { code?: string } } | null)?.error?.code;
  return { kind: code === "BOOKING_CANCELLED" ? "cancelled" : "invalid" };
}
