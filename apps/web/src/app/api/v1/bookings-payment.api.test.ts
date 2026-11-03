import { beforeEach, describe, expect, it } from "vitest";
import { liveBookings, resetBookingStore } from "@/lib/mock/booking-store";
import { PATCH as payment } from "./bookings/[id]/payment/route";

// The shop sets a booking Paid or Unpaid; the server works the amount out and keeps the entry.

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const patch = (id: string, body: unknown) => payment(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctxId(id));
const unpaid = () => liveBookings().find((b) => b.paymentStatus === "UNPAID" && b.totalAmount > 0 && b.payments.length === 0)!;

beforeEach(() => resetBookingStore());

describe("PATCH /bookings/{id}/payment", () => {
  it("sets a booking Paid, then Unpaid", async () => {
    const b = unpaid();
    expect((await patch(b.id, { paid: true })).status).toBe(200);
    expect(liveBookings().find((x) => x.id === b.id)!.paymentStatus).toBe("PAID");
    expect((await patch(b.id, { paid: false })).status).toBe(200);
    expect(liveBookings().find((x) => x.id === b.id)!.paymentStatus).toBe("UNPAID");
  });
  it("422 without paid, 404 for an unknown booking", async () => {
    expect((await patch(unpaid().id, {})).status).toBe(422);
    expect((await patch("bk-nope", { paid: true })).status).toBe(404);
  });
});
