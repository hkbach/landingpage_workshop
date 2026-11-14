import { describe, expect, it } from "vitest";
import { BOOKING_SOURCES, BOOKING_STATUSES, GENDERS, PAYMENT_METHODS, PAYMENT_STATUSES, SESSION_STATUSES, closeIfEnded, canCompleteSession, LOCALES } from "@workshop/shared";
import { bookings, customers, sessions, workshops } from "./data";

// The demo data of the shop owner has a few records (at least FEW) of every case, so each screen can be tried out with real-looking data.
const FEW = 3;
const shown = sessions.map((s) => closeIfEnded(s, new Date())); // what the Sessions screen shows (a session whose time is over is Closed)
const count = <T,>(list: readonly T[], f: (x: T) => boolean) => list.filter(f).length;

describe("demo bookings: every case has a few records", () => {
  it.each([...BOOKING_STATUSES])("status %s", (st) => expect(count(bookings, (b) => b.status === st)).toBeGreaterThanOrEqual(FEW));
  it.each([...PAYMENT_STATUSES])("payment status %s", (st) => expect(count(bookings, (b) => b.paymentStatus === st)).toBeGreaterThanOrEqual(FEW));
  it.each([...BOOKING_SOURCES])("source %s", (src) => expect(count(bookings, (b) => b.source === src)).toBeGreaterThanOrEqual(FEW));
  it.each([...PAYMENT_METHODS])("a payment by %s", (m) => expect(count(bookings, (b) => b.payments.some((p) => p.method === m))).toBeGreaterThanOrEqual(FEW));
  it("every status together with every payment status that can happen", () => {
    const pair = (st: string, pay: string) => count(bookings, (b) => b.status === st && b.paymentStatus === pay);
    for (const [st, pay] of [["NOT_CONFIRMED", "UNPAID"], ["CONFIRMED", "UNPAID"], ["CONFIRMED", "PAID"], ["CHECKED_IN", "UNPAID"], ["CHECKED_IN", "PAID"], ["CANCELLED", "UNPAID"]] as const) {
      expect(pair(st, pay), `${st} + ${pay}`).toBeGreaterThanOrEqual(FEW);
    }
  });
  it("vouchers, partial payments, refunds, cancellations with a reason and special requests", () => {
    expect(count(bookings, (b) => (b.promotionIds?.length ?? 0) > 0)).toBeGreaterThanOrEqual(FEW);
    expect(count(bookings, (b) => (b.promotionIds?.length ?? 0) > 1)).toBeGreaterThanOrEqual(1);
    expect(count(bookings, (b) => b.paymentStatus === "UNPAID" && b.payments.some((p) => p.type === "PAYMENT" && !b.payments.some((r) => r.type === "REFUND")))).toBeGreaterThanOrEqual(FEW - 1); // a part was paid
    expect(count(bookings, (b) => b.payments.some((p) => p.type === "REFUND"))).toBeGreaterThanOrEqual(FEW);
    expect(count(bookings, (b) => b.status === "CANCELLED" && Boolean(b.cancelReason))).toBeGreaterThanOrEqual(FEW);
    expect(count(bookings, (b) => Boolean(b.specialRequest))).toBeGreaterThanOrEqual(1);
  });
  it("bookings of every workshop that is on sale, and each booking sits with the workshop and the session it names", () => {
    for (const w of workshops.filter((x) => x.status === "ACTIVE")) expect(count(bookings, (b) => b.workshopId === w.id), w.id).toBeGreaterThanOrEqual(FEW);
    for (const b of bookings) expect(sessions.find((s) => s.id === b.sessionId)?.workshopId, b.id).toBe(b.workshopId);
  });
});

describe("demo sessions: every case has a few records", () => {
  it.each([...SESSION_STATUSES])("status %s, as the screen shows it", (st) => expect(count(shown, (s) => s.status === st)).toBeGreaterThanOrEqual(FEW));
  it("Completed sessions have guests who checked in and paid, and some who did not", () => {
    const done = sessions.filter((s) => s.status === "COMPLETED");
    expect(done.length).toBeGreaterThanOrEqual(FEW);
    for (const s of done) expect(count(bookings, (b) => b.sessionId === s.id && b.status === "CHECKED_IN" && b.paymentStatus === "PAID"), s.id).toBeGreaterThanOrEqual(2);
    expect(count(bookings, (b) => done.some((s) => s.id === b.sessionId) && b.status === "CHECKED_IN" && b.paymentStatus === "UNPAID")).toBeGreaterThanOrEqual(FEW - 1);
    expect(count(bookings, (b) => done.some((s) => s.id === b.sessionId) && b.status === "CANCELLED")).toBeGreaterThanOrEqual(FEW - 1);
  });
  it("Closed sessions that wait to be completed have guests in every part of the payment list (checked in, not checked in, cancelled)", () => {
    const waiting = shown.filter((s) => canCompleteSession(s) && bookings.some((b) => b.sessionId === s.id));
    expect(waiting.length).toBeGreaterThanOrEqual(FEW);
    const sections = (s: (typeof shown)[number]) => ({
      checkedIn: count(bookings, (b) => b.sessionId === s.id && b.status === "CHECKED_IN"),
      notCheckedIn: count(bookings, (b) => b.sessionId === s.id && (b.status === "CONFIRMED" || b.status === "NOT_CONFIRMED")),
      cancelled: count(bookings, (b) => b.sessionId === s.id && b.status === "CANCELLED"),
    });
    for (const part of ["checkedIn", "notCheckedIn", "cancelled"] as const) expect(count(waiting, (s) => sections(s)[part] > 0), part).toBeGreaterThanOrEqual(FEW);
    expect(count(waiting, (s) => sections(s).checkedIn >= 2 && bookings.some((b) => b.sessionId === s.id && b.paymentStatus === "UNPAID" && b.status === "CHECKED_IN"))).toBeGreaterThanOrEqual(FEW - 1); // something to confirm in bulk
  });
  it("sessions of every workshop that is on sale", () => {
    for (const w of workshops.filter((x) => x.status === "ACTIVE")) expect(count(sessions, (s) => s.workshopId === w.id), w.id).toBeGreaterThanOrEqual(FEW);
  });
});

describe("demo workshops and customers", () => {
  it("a few workshops on sale and a few drafts", () => {
    expect(count(workshops, (w) => w.status === "ACTIVE")).toBeGreaterThanOrEqual(FEW);
    expect(count(workshops, (w) => w.status === "DRAFT")).toBeGreaterThanOrEqual(2);
  });
  it.each([...LOCALES])("customers who prefer %s", (l) => expect(count(customers, (c) => c.preferredLocale === l)).toBeGreaterThanOrEqual(FEW - 1));
  it("guests with and without an account, with and without an email, and every gender (and none) among the accounts", () => {
    expect(count(customers, (c) => Boolean(c.account))).toBeGreaterThanOrEqual(FEW);
    expect(count(customers, (c) => !c.account)).toBeGreaterThanOrEqual(FEW);
    expect(count(customers, (c) => !c.email)).toBeGreaterThanOrEqual(1);
    for (const g of GENDERS) expect(count(customers, (c) => c.account?.gender === g), g).toBeGreaterThanOrEqual(FEW);
    expect(count(customers, (c) => Boolean(c.account) && !c.account?.gender)).toBeGreaterThanOrEqual(2);
    expect(new Set(customers.flatMap((c) => (c.account ? [c.account.country] : []))).size).toBeGreaterThanOrEqual(FEW);
  });
});
