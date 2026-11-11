import { describe, expect, it } from "vitest";
import type { CustomerBooking } from "./customer-bookings";
import { dayPart, needsAttention, todaysBookings, weekAhead } from "./customer-today";

// Today of the guest area: the workshops of today, what needs the guest, the next 7 days.

const NOW = new Date("2026-11-04T05:00:00Z"); // 12:00 in Ho Chi Minh City (UTC+7)
const TZ = "Asia/Ho_Chi_Minh";
const at = (days: number, hourUtc: number) => new Date(Date.UTC(2026, 10, 4 + days, hourUtc)).toISOString();

let n = 0;
function booking(over: Partial<CustomerBooking> & { startsAt: string; endsAt: string }): CustomerBooking {
  n += 1;
  return {
    id: `bk-${n}`, code: `SES-00${String(n).padStart(2, "0")}-001`, status: "CONFIRMED", paymentStatus: "PAID", workshopId: "ws-1", workshopTitle: { en: "Fresh Pasta" },
    address: "12 Nguyen Hue", timezone: TZ, quantity: 1, currency: "VND", totalAmount: 500_000, discountAmount: 0, vouchers: [], createdAt: at(-5, 3), canCancel: true, canCheckIn: false,
    shop: { slug: "whiskladle", name: "Whisk & Ladle Kitchen", address: "12 Nguyen Hue", defaultLocale: "en" }, ...over,
  };
}
const morning = booking({ startsAt: at(0, 2), endsAt: at(0, 4) }); // today 09:00-11:00, over
const nowOn = booking({ startsAt: at(0, 4), endsAt: at(0, 6) }); // 11:00-13:00, taking place
const evening = booking({ startsAt: at(0, 11), endsAt: at(0, 13) }); // 18:00-20:00
const lateNight = booking({ startsAt: at(0, 17), endsAt: at(0, 18) }); // 00:00 of the next day in Ho Chi Minh City: not today
const cancelledToday = booking({ startsAt: at(0, 9), endsAt: at(0, 10), status: "CANCELLED" });
const tomorrow = booking({ startsAt: at(1, 2), endsAt: at(1, 4) });
const day7 = booking({ startsAt: at(7, 2), endsAt: at(7, 4) });
const day8 = booking({ startsAt: at(8, 2), endsAt: at(8, 4) });
const past = booking({ startsAt: at(-2, 2), endsAt: at(-2, 4), status: "CHECKED_IN" });

describe("dayPart", () => {
  it("morning until 11:59, afternoon until 17:59, evening after", () => {
    expect([0, 6, 11].map(dayPart)).toEqual(["morning", "morning", "morning"]);
    expect([12, 15, 17].map(dayPart)).toEqual(["afternoon", "afternoon", "afternoon"]);
    expect([18, 21, 23].map(dayPart)).toEqual(["evening", "evening", "evening"]);
  });
});

describe("todaysBookings", () => {
  it("keeps the workshops of today by the day of their own time zone, earliest first, with the one taking place now and the one that is over", () => {
    expect(todaysBookings([evening, tomorrow, nowOn, morning, past], NOW).map((b) => b.id)).toEqual([morning.id, nowOn.id, evening.id]);
  });
  it("leaves out a cancelled booking and a booking that starts after midnight of the booking's zone", () => {
    expect(todaysBookings([cancelledToday, lateNight], NOW)).toEqual([]);
  });
  it("is empty when there are no bookings", () => expect(todaysBookings([], NOW)).toEqual([]));
});

describe("weekAhead", () => {
  it("lists what starts after today and up to 7 days ahead, soonest first; not today's, not day 8, not the past", () => {
    expect(weekAhead([day8, day7, tomorrow, evening, morning, past, lateNight], NOW).map((b) => b.id)).toEqual([lateNight.id, tomorrow.id, day7.id]);
  });
  it("leaves out a cancelled booking", () => {
    expect(weekAhead([booking({ startsAt: at(2, 2), endsAt: at(2, 4), status: "CANCELLED" })], NOW)).toEqual([]);
  });
});

describe("needsAttention", () => {
  const unconfirmed = booking({ startsAt: at(3, 2), endsAt: at(3, 4), status: "NOT_CONFIRMED", paymentStatus: "UNPAID" });
  const unpaid = booking({ startsAt: at(1, 2), endsAt: at(1, 4), paymentStatus: "UNPAID" });
  const free = booking({ startsAt: at(2, 2), endsAt: at(2, 4), paymentStatus: "UNPAID", totalAmount: 0 });
  const unpaidPast = booking({ startsAt: at(-4, 2), endsAt: at(-4, 4), paymentStatus: "UNPAID" });
  const unpaidCancelled = booking({ startsAt: at(4, 2), endsAt: at(4, 4), paymentStatus: "UNPAID", status: "CANCELLED" });

  it("asks to confirm a booking that is not confirmed (even if unpaid) and to pay a confirmed one that is not paid, soonest first", () => {
    const found = needsAttention([unconfirmed, unpaid], NOW);
    expect(found.map((a) => [a.booking.id, a.kind])).toEqual([[unpaid.id, "unpaid"], [unconfirmed.id, "confirm"]]);
  });
  it("does not ask for a free booking, a booking that is over, a cancelled one, or one that is paid or checked in", () => {
    expect(needsAttention([free, unpaidPast, unpaidCancelled, tomorrow, past], NOW)).toEqual([]);
  });
  it("still asks for a booking that is taking place now and not paid", () => {
    const running = booking({ startsAt: at(0, 4), endsAt: at(0, 6), paymentStatus: "UNPAID" });
    expect(needsAttention([running], NOW).map((a) => a.kind)).toEqual(["unpaid"]);
  });
});
