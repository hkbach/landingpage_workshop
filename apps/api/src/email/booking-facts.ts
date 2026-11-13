// What every email about a booking says, taken from the booking (and, when the session has moved since the booking was made, from the session): the raw facts, which the renderers of
// @workshop/shared write in the six languages of the email.
export interface BookingFacts {
  guestName: string; shopName: string; bookingCode: string; workshopTitle: string; startsAt: string; endsAt: string; timezone: string;
  quantity: number; totalAmount: number; currency: string; address: string;
}

/** The title of a workshop in the default language of the shop, then in any other language it has. */
export const titleOf = (title: Record<string, string>, shopLocale: string): string => title[shopLocale] || title.en || Object.values(title).find(Boolean) || "";

export function bookingFacts(
  shop: { name: string; defaultLocale: string },
  b: { guestName: string; bookingCode: string; quantity: number; totalAmount: number; currency: string; snapshot: { workshopTitle: Record<string, string>; startsAt: string; endsAt: string; timezone: string; address: string } },
  now?: { startsAt?: Date; endsAt?: Date; title?: Record<string, string> },
): BookingFacts {
  return {
    guestName: b.guestName, shopName: shop.name, bookingCode: b.bookingCode, workshopTitle: titleOf(now?.title ?? b.snapshot.workshopTitle, shop.defaultLocale),
    startsAt: (now?.startsAt ?? new Date(b.snapshot.startsAt)).toISOString(), endsAt: (now?.endsAt ?? new Date(b.snapshot.endsAt)).toISOString(), timezone: b.snapshot.timezone,
    quantity: b.quantity, totalAmount: b.totalAmount, currency: b.currency, address: b.snapshot.address,
  };
}
