import { ownAddressNote, workshopAddress, workshopDirectionsUrl } from "@workshop/shared";
import { apiError } from "@/lib/api-error";
import { customerLoginRequired } from "@/lib/customer-access";
import type { CustomerBooking } from "@/lib/customer-bookings";
import { accountOfGuest, canGuestCancel, canGuestCheckIn, liveBookings } from "@/lib/mock/booking-store";
import { currentShop, workshops } from "@/lib/mock/data";
import { allPromotions } from "@/lib/mock/promotion-store";
import { ratingOfBooking, sessionEnded } from "@/lib/mock/rating-store";

// The bookings of a guest, seen by the guest (My Booking of /customer/{id}). MOCK implementation inside Next until apps/api exists. The same access as the profile
// (see ../route.ts): the email of the account in `x-guest-email`, or the id alone while the login of the guest area is switched off (never in production), and the same
// 404 for an unknown id, a customer without an account and a wrong email. Only the bookings of that customer, and only what the guest is shown (no payments, no ids of others).
// TODO(api): the account of the guest session (cookie); the bookings of every shop of the account, filtered by organization_id.

const headers = { "cache-control": "no-store", "x-robots-tag": "noindex" };

/** GET -> 200 { bookings, now }; `now` is the time of the server, so the page counts "today" and "in 3 days" from it. 404 NOT_FOUND. */
export async function GET(request: Request, ctx: RouteContext<"/api/v1/customer/[id]/bookings">) {
  const { id } = await ctx.params;
  const email = customerLoginRequired() ? (request.headers.get("x-guest-email") ?? "") : null;
  if (!accountOfGuest(id, email)) return apiError(404, "NOT_FOUND", "Account not found.", {}, headers);
  const now = new Date();
  const vouchers = allPromotions();
  const bookings: CustomerBooking[] = liveBookings()
    .filter((b) => b.customerId === id)
    .flatMap((b): CustomerBooking[] => {
      const workshop = workshops.find((w) => w.id === b.workshopId);
      if (!workshop) return [];
      return [{
        id: b.id, code: b.bookingCode, status: b.status, paymentStatus: b.paymentStatus, workshopId: b.workshopId, workshopTitle: workshop.title, ...(workshop.coverUrl ? { coverUrl: workshop.coverUrl } : {}),
        address: workshopAddress(workshop, currentShop.address), ...(ownAddressNote(workshop) ? { addressNote: ownAddressNote(workshop) } : {}), ...(workshopDirectionsUrl(workshop, currentShop) ? { directionsUrl: workshopDirectionsUrl(workshop, currentShop) } : {}),
        startsAt: b.startsAt, endsAt: b.endsAt, timezone: b.timezone, quantity: b.quantity, currency: b.currency, totalAmount: b.totalAmount, discountAmount: b.discountAmount ?? 0,
        vouchers: vouchers.filter((p) => b.promotionIds?.includes(p.id)).map((p) => p.code ?? p.id), ...(b.checkedInAt ? { checkedInAt: b.checkedInAt } : {}),
        ...(b.cancelReason ? { cancelReason: b.cancelReason } : {}), ...(b.cancelledBy ? { cancelledBy: b.cancelledBy } : {}), ...(b.specialRequest ? { specialRequest: b.specialRequest } : {}),
        createdAt: b.createdAt, canCancel: canGuestCancel(b, now), canCheckIn: canGuestCheckIn(b, now),
        // Rate this workshop: on once the guest checked in, the session has ended and they have not rated yet; after that the stars the guest gave.
        canRate: b.status === "CHECKED_IN" && sessionEnded(b, now) && !ratingOfBooking(b.id), ...(ratingOfBooking(b.id) ? { rating: { stars: ratingOfBooking(b.id)!.stars, comment: ratingOfBooking(b.id)!.comment } } : {}),
        shop: { slug: currentShop.slug, name: currentShop.name, address: currentShop.address, defaultLocale: currentShop.defaultLocale },
      }];
    });
  return Response.json({ bookings, now: now.toISOString() }, { headers });
}
