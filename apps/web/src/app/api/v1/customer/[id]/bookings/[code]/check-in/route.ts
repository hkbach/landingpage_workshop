import { apiError } from "@/lib/api-error";
import { customerLoginRequired } from "@/lib/customer-access";
import { accountOfGuest, checkInByGuest } from "@/lib/mock/booking-store";
import { recordAudit } from "@/lib/mock/admin-audit-store";
import { customerActor, DEMO_ORG } from "@/lib/mock/audit-actors";

// A guest checks themselves in to one of their bookings (My Booking of /customer/{id}). MOCK implementation inside Next until apps/api exists. The same access as the rest of
// /customer/{id}: the email of the account in `x-guest-email`, or the id alone while the login of the guest area is switched off (never in production). The booking is found among the
// bookings of that customer only. The server decides whether it is time (the browser is not trusted): see canGuestCheckIn. TODO(api): the account of the guest session (cookie); audit
// "checked in by the guest".

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };

/** POST -> 200 { code, status: "CHECKED_IN", checkedInAt }. 404 NOT_FOUND (unknown account, wrong email, or a booking that is not theirs), 409 NOT_CHECKABLE. */
export async function POST(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/bookings/[code]/check-in">) {
  const { id, code } = await ctx.params;
  const email = customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null;
  if (!accountOfGuest(id, email)) return apiError(404, "NOT_FOUND", "Account not found.", {}, headers);
  const res = checkInByGuest(id, code);
  if (!res.ok) {
    return res.code === "NOT_FOUND"
      ? apiError(404, "NOT_FOUND", "Booking not found.", {}, headers)
      : apiError(409, "NOT_CHECKABLE", "This booking cannot be checked in now: it has to be confirmed, the check-in opens an hour before the workshop and closes when it ends.", {}, headers);
  }
  recordAudit({ ...customerActor(id), action: "booking.check_in", entityType: "Booking", entityId: res.booking.id, organizationId: DEMO_ORG, details: res.booking.bookingCode });
  return Response.json({ code: res.booking.bookingCode, status: res.booking.status, checkedInAt: res.booking.checkedInAt }, { headers });
}
