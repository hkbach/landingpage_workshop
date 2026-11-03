// SERVER-ONLY: the payments the Income page and the Overview read, with the vouchers each booking used when it was paid.
// TODO(api): the backend joins the booking payments with the promotions kept on the booking (a snapshot, so a later edit of the promotion does
// not change the history).
import type { PaymentSource } from "@workshop/shared";
import type { Booking } from "@/lib/types";
import { paymentHistory } from "./data";
import { allPromotions } from "./promotion-store";

/** The demo history of past months followed by the payments of the bookings; each booking carries the codes of the promotions it used. */
export function paymentSources(bookings: readonly Booking[]): PaymentSource[] {
  const promotions = allPromotions();
  const codeOf = (id: string) => { const p = promotions.find((x) => x.id === id); return p ? (p.code || p.title.en || id) : null; };
  return [
    ...paymentHistory,
    ...bookings.map((b): PaymentSource => ({
      id: b.id, bookingCode: b.bookingCode, currency: b.currency, payments: b.payments,
      vouchers: (b.promotionIds ?? []).flatMap((id) => codeOf(id) ?? []),
    })),
  ];
}
