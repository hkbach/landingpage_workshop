import { describe, expect, it } from "vitest";
import { BOOKING_CODE_RE, DEFAULT_FEE_RATES, ledgerFromPayments, summarizeLedger } from "@workshop/shared";
import { computePaymentStatus, netPaid } from "@/lib/booking-state";
import { bookings, paymentHistory } from "./data";

// The demo payments feed the Income page: they must agree with the bookings (status, total, vouchers) and with each other.

describe("payments of the demo bookings", () => {
  it("the payment status of every booking is the one its payments give", () => {
    for (const b of bookings) expect(b.paymentStatus, b.id).toBe(computePaymentStatus(b.totalAmount, b.payments));
  });
  it("a payment is never more than the total, and a refund never more than what was paid", () => {
    for (const b of bookings) {
      const paid = b.payments.filter((p) => p.type === "PAYMENT").reduce((n, p) => n + p.amount, 0);
      const refunded = b.payments.filter((p) => p.type === "REFUND").reduce((n, p) => n + p.amount, 0);
      expect(paid, b.id).toBeLessThanOrEqual(b.totalAmount);
      expect(refunded, b.id).toBeLessThanOrEqual(paid);
    }
  });
  it("the total of a booking is the price of its seats minus its discount", () => {
    for (const b of bookings) expect(b.totalAmount, b.id).toBe(b.unitPriceAmount * b.quantity - (b.discountAmount ?? 0));
  });
  it("a cancelled booking that had paid was refunded, all or part of it; a guest who never came keeps the payment", () => {
    const cancelledPaid = bookings.filter((b) => b.status === "CANCELLED" && b.payments.some((p) => p.type === "PAYMENT"));
    expect(cancelledPaid.length).toBeGreaterThan(0);
    for (const b of cancelledPaid) expect(b.payments.some((p) => p.type === "REFUND"), b.id).toBe(true);
    for (const b of cancelledPaid) expect(b.paymentStatus, b.id).toBe("UNPAID"); // what was paid went back, so nothing is paid any more
    // A guest who booked, paid and never came is still CONFIRMED (there is no no-show status) and keeps the payment.
    const kept = bookings.find((b) => b.id === "bk-20")!;
    expect(kept.status).toBe("CONFIRMED");
    expect(netPaid(kept.payments)).toBe(kept.totalAmount);
  });
  it("both payment statuses are covered, and there are no others", () => {
    for (const st of ["UNPAID", "PAID"] as const) expect(bookings.some((b) => b.paymentStatus === st), st).toBe(true);
    expect(bookings.every((b) => b.paymentStatus === "UNPAID" || b.paymentStatus === "PAID")).toBe(true);
  });
});

describe("payment history of past months", () => {
  it("every booking has a booking code, a voucher list and its payments, with unique ids", () => {
    expect(new Set(paymentHistory.map((b) => b.bookingCode + b.id)).size).toBe(paymentHistory.length);
    const ids = paymentHistory.flatMap((b) => b.payments.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of paymentHistory) {
      expect(BOOKING_CODE_RE.test(b.bookingCode), b.bookingCode).toBe(true);
      expect(bookings.some((x) => x.bookingCode === b.bookingCode), `${b.bookingCode} is also a listed booking`).toBe(false);
      expect(b.payments[0]!.type, b.id).toBe("PAYMENT");
      expect(b.payments[0]!.amount, b.id).toBeGreaterThan(0);
    }
  });
  it("a refund is never more than the payment, and comes after it", () => {
    for (const b of paymentHistory) {
      const [pay, refund] = b.payments;
      if (refund) {
        expect(refund.type).toBe("REFUND");
        expect(refund.amount, b.id).toBeLessThanOrEqual(pay!.amount);
        expect(refund.recordedAt > pay!.recordedAt, b.id).toBe(true);
      }
    }
  });
  it("has vouchers (one and several), bookings without one, full and partial refunds", () => {
    expect(paymentHistory.some((b) => b.price?.discounts.length === 1)).toBe(true);
    expect(paymentHistory.some((b) => (b.price?.discounts.length ?? 0) >= 2)).toBe(true);
    expect(paymentHistory.some((b) => !b.price?.discounts.length)).toBe(true);
    expect(paymentHistory.some((b) => b.payments[1] && b.payments[1].amount === b.payments[0]!.amount)).toBe(true);
    expect(paymentHistory.some((b) => b.payments[1] && b.payments[1].amount < b.payments[0]!.amount)).toBe(true);
  });
  it("covers the five months before this one, with payments in every one of them", () => {
    const months = new Set(paymentHistory.flatMap((b) => b.payments.map((p) => p.recordedAt.slice(0, 7))));
    expect(months.size).toBeGreaterThanOrEqual(5);
  });
});

describe("the ledger of the demo shop", () => {
  const rows = ledgerFromPayments([...paymentHistory, ...bookings.map((b) => ({ id: b.id, bookingCode: b.bookingCode, currency: b.currency, payments: b.payments }))], DEFAULT_FEE_RATES);
  it("is profit = income - maintenance fee - service fee, and the income is positive", () => {
    const t = summarizeLedger(rows);
    expect(t.income).toBeGreaterThan(0);
    expect(t.profit).toBe(t.income - t.maintenanceFee - t.serviceFee);
    expect(t.fees).toBeGreaterThan(0);
  });
  it("has payments and refunds", () => {
    expect(rows.some((r) => r.kind === "PAYMENT")).toBe(true);
    expect(rows.some((r) => r.kind === "REFUND")).toBe(true);
  });
});
