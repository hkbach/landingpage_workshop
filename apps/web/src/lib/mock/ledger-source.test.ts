import { beforeEach, describe, expect, it } from "vitest";
import { ledgerFromPayments, DEFAULT_FEE_RATES } from "@workshop/shared";
import { liveBookings, recordPaid, resetBookingStore, setBookingStatus } from "./booking-store";
import { paymentHistory } from "./data";
import { paymentSources } from "./ledger-source";

// The Income page and the Overview collect and add up only the bookings whose payment status is Paid.

beforeEach(() => resetBookingStore());

const codes = () => new Set(paymentSources(liveBookings()).map((s) => s.bookingCode));

describe("paymentSources: only Paid bookings", () => {
  it("has the bookings that are Paid and none that is Unpaid", () => {
    const all = liveBookings();
    const got = codes();
    for (const b of all) expect(got.has(b.bookingCode), `${b.bookingCode} ${b.paymentStatus}`).toBe(b.paymentStatus === "PAID");
    expect(all.some((b) => b.paymentStatus === "PAID")).toBe(true);
    expect(all.some((b) => b.paymentStatus === "UNPAID")).toBe(true);
  });
  it("leaves out a booking that was paid and then refunded, and every payment of an Unpaid booking", () => {
    const refunded = liveBookings().filter((b) => b.paymentStatus === "UNPAID" && b.payments.some((p) => p.type === "PAYMENT"));
    expect(refunded.length).toBeGreaterThan(0);
    const rows = ledgerFromPayments(paymentSources(liveBookings()), DEFAULT_FEE_RATES);
    for (const b of refunded) expect(rows.some((r) => r.bookingCode === b.bookingCode), b.bookingCode).toBe(false);
  });
  it("keeps the bookings of the history that are paid in full, and drops the ones that were given back (in full or half)", () => {
    const given = paymentHistory.filter((h) => h.payments.some((p) => p.type === "REFUND"));
    expect(given.length).toBeGreaterThan(0);
    const ids = new Set(paymentSources([]).map((s) => s.id));
    for (const h of given) expect(ids.has(h.id), h.id).toBe(false);
    for (const h of paymentHistory.filter((x) => x.payments.every((p) => p.type === "PAYMENT"))) expect(ids.has(h.id), h.id).toBe(true);
  });
  it("so every row of the ledger belongs to a Paid booking and the refunds that are left are none", () => {
    const rows = ledgerFromPayments(paymentSources(liveBookings()), DEFAULT_FEE_RATES);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.kind === "PAYMENT" || r.amount < 0)).toBe(true);
  });
});

describe("a booking the shop sets Paid or Unpaid (recordPaid)", () => {
  const unpaid = () => liveBookings().find((b) => b.paymentStatus === "UNPAID" && b.totalAmount > 0 && b.status !== "CANCELLED" && b.payments.length === 0)!;
  it("joins the figures when it becomes Paid, with the whole price as a cash payment", () => {
    const b = unpaid();
    expect(codes().has(b.bookingCode)).toBe(false);
    expect(recordPaid(b.id, true, "Linh Tran")).toBe(true);
    const now = liveBookings().find((x) => x.id === b.id)!;
    expect(now.paymentStatus).toBe("PAID");
    expect(now.payments.at(-1)).toMatchObject({ type: "PAYMENT", amount: b.totalAmount, method: "CASH", recordedBy: "Linh Tran" });
    expect(codes().has(b.bookingCode)).toBe(true);
  });
  it("leaves the figures when it becomes Unpaid again, and the entries are only added", () => {
    const b = unpaid();
    recordPaid(b.id, true, "Linh Tran");
    expect(recordPaid(b.id, false, "Linh Tran")).toBe(true);
    const now = liveBookings().find((x) => x.id === b.id)!;
    expect(now.paymentStatus).toBe("UNPAID");
    expect(now.payments.map((p) => p.type)).toEqual(["PAYMENT", "REFUND"]);
    expect(codes().has(b.bookingCode)).toBe(false);
  });
  it("checks the booking in when it becomes Paid (Not confirmed or Confirmed), and Unpaid brings back the status it had", () => {
    for (const status of ["NOT_CONFIRMED", "CONFIRMED"] as const) {
      resetBookingStore();
      const b = liveBookings().find((x) => x.status === status && x.paymentStatus === "UNPAID" && x.totalAmount > 0 && x.payments.length === 0);
      if (!b) continue;
      recordPaid(b.id, true, "x", new Date("2026-11-05T10:00:00Z"));
      expect(liveBookings().find((x) => x.id === b.id)).toMatchObject({ status: "CHECKED_IN", statusBeforeCheckIn: status, checkedInAt: "2026-11-05T10:00:00.000Z" });
      recordPaid(b.id, false, "x");
      const back = liveBookings().find((x) => x.id === b.id)!;
      expect(back.status).toBe(status);
      expect(back.checkedInAt).toBeUndefined();
      expect(back.paymentStatus).toBe("UNPAID");
      // Paid once more: checked in again.
      recordPaid(b.id, true, "x");
      expect(liveBookings().find((x) => x.id === b.id)!.status).toBe("CHECKED_IN");
    }
  });
  it("a guest the owner checked in by hand also goes back to the status before the check-in when the booking is set Unpaid", () => {
    for (const status of ["NOT_CONFIRMED", "CONFIRMED"] as const) {
      resetBookingStore();
      const b = liveBookings().find((x) => x.status === status && x.paymentStatus === "UNPAID" && x.totalAmount > 0 && x.payments.length === 0);
      if (!b) continue;
      setBookingStatus(b.id, "CHECKED_IN", undefined, "2026-11-05T10:00:00Z", status);
      recordPaid(b.id, true, "x");
      expect(liveBookings().find((x) => x.id === b.id)!.status).toBe("CHECKED_IN"); // already checked in: it stays
      recordPaid(b.id, false, "x");
      expect(liveBookings().find((x) => x.id === b.id)).toMatchObject({ status, paymentStatus: "UNPAID" });
    }
  });
  it("a seeded booking that was checked in (no status recorded before) goes back to Confirmed", () => {
    const b = liveBookings().find((x) => x.status === "CHECKED_IN" && x.paymentStatus === "PAID" && x.totalAmount > 0)!;
    expect(b).toBeDefined();
    recordPaid(b.id, false, "x");
    expect(liveBookings().find((x) => x.id === b.id)).toMatchObject({ status: "CONFIRMED", paymentStatus: "UNPAID" });
  });
  it("a cancelled booking keeps its status when it becomes Paid", () => {
    const b = liveBookings().find((x) => x.status === "CANCELLED" && x.paymentStatus === "UNPAID" && x.totalAmount > 0)!;
    expect(b).toBeDefined();
    recordPaid(b.id, true, "x");
    expect(liveBookings().find((x) => x.id === b.id)).toMatchObject({ status: "CANCELLED", paymentStatus: "PAID" });
  });
  it("does nothing twice, and refuses an unknown booking", () => {
    const b = unpaid();
    recordPaid(b.id, true, "x");
    recordPaid(b.id, true, "x");
    expect(liveBookings().find((x) => x.id === b.id)!.payments).toHaveLength(1);
    expect(recordPaid("bk-nope", true, "x")).toBe(false);
  });
});
