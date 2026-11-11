// SERVER-ONLY: the payments the Income page and the Overview read, with the vouchers each booking used when it was paid.
// TODO(api): the backend joins the booking payments with the promotions kept on the booking (a snapshot, so a later edit of the promotion does
// not change the history).
import { discountAmount, priceBooking, type BookingPriceInfo, type PaymentSource } from "@workshop/shared";
import { computePaymentStatus } from "@/lib/booking-state";
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
    let lines = priced.ok ? priced.discounts : used.map((p) => ({ id: p.id, amount: discountAmount(subtotal, p) }));
    // The booking keeps what its promotions took off when it was made (BR-05: history is not recalculated). A promotion edited or deleted later must not change the
    // fees of a past booking, so the lines are scaled to that snapshot; a deleted promotion keeps its id as the label.
    const snapshot = Math.max(0, Math.min(subtotal, b.discountAmount ?? subtotal - b.totalAmount));
    const sum = lines.reduce((n, l) => n + l.amount, 0);
    if (sum !== snapshot) {
      if (snapshot === 0) lines = [];
      else if (sum > 0) {
        const scaled = lines.map((l) => ({ id: l.id, amount: Math.floor((l.amount * snapshot) / sum) }));
        scaled[scaled.length - 1]!.amount += snapshot - scaled.reduce((n, l) => n + l.amount, 0);
        lines = scaled;
      } else lines = [{ id: b.promotionIds?.[0] ?? "discount", amount: snapshot }];
    }
    return { subtotal, discounts: lines.map((l) => ({ code: codeOf(l.id) ?? l.id, amount: l.amount })) };
  };
  return priceOf;
}

/** The original price of each booking and what each voucher took off it, by booking id (the Bookings page shows them in a tooltip and a Voucher column). */
export function bookingPrices(bookings: readonly Booking[]): Record<string, BookingPriceInfo> {
  const priceOf = priceReader();
  return Object.fromEntries(bookings.map((b) => [b.id, priceOf(b)]));
}

/**
 * What the Income page and the Overview collect: only the bookings whose payment status is PAID (every payment and refund of such a booking). A booking
 * that is Unpaid (never paid, paid in part, or paid and then given back) has no place in the figures. A booking of the demo history is Paid when what
 * was paid, less the refunds, covers the price it was paid for.
 */
export function paymentSources(bookings: readonly Booking[]): PaymentSource[] {
  const priceOf = priceReader();
  const historyPaid = (h: (typeof paymentHistory)[number]) =>
    computePaymentStatus(h.payments.reduce((n, p) => (p.type === "PAYMENT" ? n + p.amount : n), 0), h.payments) === "PAID";
  return [
    ...paymentHistory.filter(historyPaid),
    ...bookings.filter((b) => b.paymentStatus === "PAID").map((b): PaymentSource => ({
      id: b.id, bookingCode: b.bookingCode, currency: b.currency, payments: b.payments,
      price: priceOf(b),
    })),
  ];
}
