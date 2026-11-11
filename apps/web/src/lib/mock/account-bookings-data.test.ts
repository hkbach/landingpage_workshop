import { describe, expect, it } from "vitest";
import { canGuestCancel, canGuestCheckIn, liveBookings, liveCustomers, shopSessions } from "./booking-store";

// Every customer with an account has bookings for the Check in and the Cancel buttons of My Booking to be tried, in every state, whenever the server starts.

const accounts = liveCustomers().filter((c) => c.account);

describe("the demo bookings of the customers with an account", () => {
  it("there are customers with an account", () => {
    expect(accounts.length).toBeGreaterThanOrEqual(10);
  });
  it.each(accounts.map((c) => [c.id, c.fullName]))("%s (%s) has a booking to check in to, one to cancel, one attended and one cancelled", (id) => {
    const mine = liveBookings().filter((b) => b.customerId === id);
    const now = new Date();
    expect(mine.some((b) => canGuestCheckIn(b, now)), "can check in now").toBe(true);
    expect(mine.some((b) => b.status === "CONFIRMED" && canGuestCancel(b, now)), "a confirmed one to cancel").toBe(true);
    expect(mine.some((b) => b.status === "NOT_CONFIRMED" && canGuestCancel(b, now)), "a not confirmed one to cancel").toBe(true);
    expect(mine.some((b) => b.status === "CHECKED_IN"), "attended").toBe(true);
    expect(mine.some((b) => b.status === "CANCELLED" && b.cancelledBy === "GUEST"), "cancelled by the guest").toBe(true);
  });
  it("no session is over its capacity because of them, and none of them is paid", () => {
    for (const s of shopSessions()) expect(s.reservedCount, s.id).toBeLessThanOrEqual(s.capacity);
    const generated = liveBookings().filter((b) => /^bk-g\d+$/.test(b.id));
    expect(generated.length).toBeGreaterThan(accounts.length * 3);
    expect(generated.every((b) => b.payments.length === 0 && b.paymentStatus === "UNPAID")).toBe(true);
  });
});
