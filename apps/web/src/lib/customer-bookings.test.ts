import { describe, expect, it } from "vitest";
import {
  bookingPhase, cancelBlock, checkInBlock, checkInNote, filterBookings, sortBookings, summarize, tabOf, whenOf, type BookingFilter, type CustomerBooking,
} from "./customer-bookings";

// My Booking: the guest sees their bookings by time, searches them, checks in from an hour before the workshop (or the shop checks them in) and cancels until the session starts.

const NOW = new Date("2026-11-04T05:00:00Z"); // 12:00 in Ho Chi Minh City (UTC+7)
const TZ = "Asia/Ho_Chi_Minh";
const at = (days: number, hourUtc: number) => new Date(Date.UTC(2026, 10, 4 + days, hourUtc)).toISOString();

let n = 0;
function booking(over: Partial<CustomerBooking> & { startsAt: string; endsAt: string }): CustomerBooking {
  n += 1;
  return {
    id: `bk-${n}`, code: `SES-00${String(n).padStart(2, "0")}-001`, status: "CONFIRMED", paymentStatus: "UNPAID", workshopId: "ws-1", workshopTitle: { en: "Fresh Pasta from Scratch", vi: "Làm pasta tươi từ đầu" },
    address: "12 Nguyen Hue, District 1", timezone: TZ, quantity: 2, currency: "VND", totalAmount: 1_300_000, discountAmount: 0, vouchers: [], createdAt: at(-5, 3), canCancel: true, canCheckIn: false, canRate: false,
    shop: { slug: "whiskladle", name: "Whisk & Ladle Kitchen", address: "12 Nguyen Hue", defaultLocale: "en" }, ...over,
  };
}
const soon = booking({ startsAt: at(0, 9), endsAt: at(0, 11) }); // today, 16:00-18:00
const tomorrow = booking({ startsAt: at(1, 2), endsAt: at(1, 4), workshopId: "ws-2", workshopTitle: { en: "Decorate Your Cupcakes" } });
const later = booking({ startsAt: at(9, 2), endsAt: at(9, 4), status: "NOT_CONFIRMED", workshopId: "ws-4", workshopTitle: { en: "Dim Sum Night" } });
const now_ = booking({ startsAt: at(0, 4), endsAt: at(0, 6), canCancel: false }); // started an hour ago, ends in an hour
const attended = booking({ startsAt: at(-3, 2), endsAt: at(-3, 4), status: "CHECKED_IN", checkedInAt: at(-3, 2.1), canCancel: false });
const missed = booking({ startsAt: at(-6, 2), endsAt: at(-6, 4), canCancel: false }); // confirmed, never came
const cancelled = booking({ startsAt: at(5, 2), endsAt: at(5, 4), status: "CANCELLED", cancelledBy: "GUEST", cancelReason: "Changed plans", canCancel: false });
const all = [attended, later, cancelled, soon, missed, tomorrow, now_];
const base: BookingFilter = { tab: "all", query: "", workshopId: "", from: "", to: "" };

describe("where a booking is in time", () => {
  it("is cancelled, still to come, taking place now, or over", () => {
    expect(bookingPhase(cancelled, NOW)).toBe("CANCELLED");
    expect(bookingPhase(soon, NOW)).toBe("UPCOMING");
    expect(bookingPhase(now_, NOW)).toBe("IN_PROGRESS");
    expect(bookingPhase(attended, NOW)).toBe("PAST");
    expect(bookingPhase({ ...soon, status: "CANCELLED" }, NOW)).toBe("CANCELLED"); // a cancelled one stays cancelled whatever the time
  });
  it("puts one taking place now in Upcoming (it is not over), and the cancelled ones in Cancelled", () => {
    expect([soon, now_, later].map((b) => tabOf(b, NOW))).toEqual(["upcoming", "upcoming", "upcoming"]);
    expect([attended, missed].map((b) => tabOf(b, NOW))).toEqual(["past", "past"]);
    expect(tabOf(cancelled, NOW)).toBe("cancelled");
  });
  it("says how far it is, by the days of its own zone", () => {
    expect(whenOf(soon, NOW)).toEqual({ kind: "today" });
    expect(whenOf(tomorrow, NOW)).toEqual({ kind: "tomorrow" });
    expect(whenOf(later, NOW)).toEqual({ kind: "inDays", days: 9 });
    expect(whenOf(now_, NOW)).toEqual({ kind: "inProgress" });
    expect(whenOf(attended, NOW)).toEqual({ kind: "finished" });
    expect(whenOf(cancelled, NOW)).toEqual({ kind: "cancelled" });
    // 22:00 UTC is already the next day in Ho Chi Minh City: "tomorrow", not "today"
    expect(whenOf({ ...soon, startsAt: "2026-11-04T22:00:00Z", endsAt: "2026-11-04T23:00:00Z" }, NOW)).toEqual({ kind: "tomorrow" });
  });
});

describe("check-in and cancel, as a guest sees them", () => {
  it("a guest is told that the check-in happened, or to show the code (or check in), or to confirm first", () => {
    expect(checkInNote(attended, NOW)).toEqual({ kind: "checkedIn", at: attended.checkedInAt });
    expect(checkInNote(soon, NOW)).toEqual({ kind: "showCode" });
    expect(checkInNote(now_, NOW)).toEqual({ kind: "showCode" });
    expect(checkInNote(later, NOW)).toEqual({ kind: "confirm" });
    expect(checkInNote(missed, NOW)).toBeNull(); // over: nothing to do
    expect(checkInNote(cancelled, NOW)).toBeNull();
  });
  it("can check in what the server allows, and is told why not otherwise", () => {
    expect(checkInBlock({ ...soon, canCheckIn: true }, NOW)).toBeNull();
    expect(checkInBlock(attended, NOW)).toBe("checkedIn");
    expect(checkInBlock(cancelled, NOW)).toBe("cancelled");
    expect(checkInBlock(later, NOW)).toBe("confirm"); // the link of the email first
    expect(checkInBlock(missed, NOW)).toBe("over");
    expect(checkInBlock(tomorrow, NOW)).toBe("notYet"); // opens an hour before the start
    expect(checkInBlock(now_, NOW)).toBe("closed"); // taking place, confirmed, and the server says no: its session is closed
  });
  it("can cancel what the server allows, and is told why not otherwise", () => {
    for (const b of [soon, tomorrow, later]) expect(cancelBlock(b, NOW), b.id).toBeNull();
    expect(cancelBlock(now_, NOW)).toBe("started");
    expect(cancelBlock(attended, NOW)).toBe("checkedIn");
    expect(cancelBlock({ ...tomorrow, canCancel: false }, NOW)).toBe("closed"); // to come, but its session is closed
    expect(cancelBlock(missed, NOW)).toBeNull(); // over: nothing to cancel
    expect(cancelBlock(cancelled, NOW)).toBeNull(); // already cancelled
  });
});

describe("the list", () => {
  it("is filtered by tab", () => {
    const ids = (tab: BookingFilter["tab"]) => filterBookings(all, { ...base, tab }, NOW).map((b) => b.id).sort();
    expect(ids("all")).toHaveLength(7);
    expect(ids("upcoming")).toEqual([later, soon, tomorrow, now_].map((b) => b.id).sort());
    expect(ids("past")).toEqual([attended, missed].map((b) => b.id).sort());
    expect(ids("cancelled")).toEqual([cancelled.id]);
  });
  it("is searched by code, workshop (any language, no accents) or shop; an empty search keeps all", () => {
    const found = (query: string) => filterBookings(all, { ...base, query }, NOW);
    expect(found("  ").length).toBe(7);
    expect(found(soon.code.toLowerCase()).map((b) => b.id)).toEqual([soon.id]);
    expect(found("cupcake").map((b) => b.id)).toEqual([tomorrow.id]);
    expect(found("dim sum").map((b) => b.id)).toEqual([later.id]);
    expect(found("lam pasta tuoi").length).toBe(5); // "Làm pasta tươi từ đầu": the five pasta bookings
    expect(found("ladle").length).toBe(7); // the shop
    expect(found("brew").length).toBe(0);
    expect(found("Changed plans").length).toBe(0); // the reason is not searched
  });
  it("is filtered by workshop and by the days of the range (the zone of the booking)", () => {
    expect(filterBookings(all, { ...base, workshopId: "ws-4" }, NOW).map((b) => b.id)).toEqual([later.id]);
    expect(filterBookings(all, { ...base, from: "2026-11-05", to: "2026-11-05" }, NOW).map((b) => b.id)).toEqual([tomorrow.id]);
    expect(filterBookings(all, { ...base, from: "2026-11-06" }, NOW).map((b) => b.id).sort()).toEqual([cancelled.id, later.id].sort()); // Nov 9 and Nov 13
    expect(filterBookings(all, { ...base, to: "2026-10-31" }, NOW).map((b) => b.id)).toEqual([missed.id]);
  });
  it("shows what is still to come first, soonest first, then what is over or cancelled, newest first", () => {
    expect(sortBookings(all, NOW).map((b) => b.id)).toEqual([now_, soon, tomorrow, later, cancelled, attended, missed].map((b) => b.id));
  });
  it("does not change the list it is given", () => {
    const copy = [...all];
    sortBookings(all, NOW);
    filterBookings(all, { ...base, tab: "past" }, NOW);
    expect(all).toEqual(copy);
  });
});

describe("the summary", () => {
  it("counts the tabs, the bookings attended and gives the next one", () => {
    const s = summarize(all, NOW);
    expect(s).toMatchObject({ all: 7, upcoming: 4, past: 2, cancelled: 1, attended: 1 });
    expect(s.next?.id).toBe(now_.id); // the one taking place now comes first
  });
  it("has no next booking when nothing is to come", () => {
    expect(summarize([attended, missed, cancelled], NOW).next).toBeUndefined();
    expect(summarize([], NOW)).toEqual({ all: 0, upcoming: 0, past: 0, cancelled: 0, attended: 0 });
  });
});
