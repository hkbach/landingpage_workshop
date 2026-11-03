// SERVER-ONLY: the payments the Income page and the Overview read, with the vouchers each booking used when it was paid.
// TODO(api): the backend joins the booking payments with the promotions kept on the booking (a snapshot, so a later edit of the promotion does
// not change the history).
import { discountAmount, priceBooking, type BookingPriceInfo, type PaymentSource } from "@workshop/shared";
import type { Booking } from "@/lib/types";
import { paymentHistory } from "./data";
import { allPromotions } from "./promotion-store";

/** The demo history of past months followed by the payments of the bookings; each booking carries the codes of the promotions it used. */
function priceReader() {
  const promotions = allPromotions();
  const codeOf = (id: string) => { const p = promotions.find((x) => x.id === id); return p ? (p.code || p.title.en || id) : null; };
  /** The original price of a booking and what each of its vouchers took off, worked out with the rule of a real booking (every discount on the original price). */
  const priceOf = (b: Booking): BookingPriceInfo => {
    const used = (b.promotionIds ?? []).flatMap((id) => { const p = promotions.find((x) => x.id === id); return p ? [p] : []; });
    const subtotal = b.unitPriceAmount * b.quantity;
    const priced = priceBooking({ unitPrice: b.unitPriceAmount, quantity: b.quantity, promotions: used });
    const lines = priced.ok ? priced.discounts : used.map((p) => ({ id: p.id, amount: discountAmount(subtotal, p) }));
    return { subtotal, discounts: lines.map((l) => ({ code: codeOf(l.id) ?? l.id, amount: l.amount })) };
  };
  return priceOf;
}

/** The original price of each booking and what each voucher took off it, by booking id (the Bookings page shows them in a tooltip and a Voucher column). */
export function bookingPrices(bookings: readonly Booking[]): Record<string, BookingPriceInfo> {
  const priceOf = priceReader();
  return Object.fromEntries(bookings.map((b) => [b.id, priceOf(b)]));
}

export function paymentSources(bookings: readonly Booking[]): PaymentSource[] {
  const priceOf = priceReader();
  return [
    ...paymentHistory,
    ...bookings.map((b): PaymentSource => ({
      id: b.id, bookingCode: b.bookingCode, currency: b.currency, payments: b.payments,
      price: priceOf(b),
    })),
  ];
}
