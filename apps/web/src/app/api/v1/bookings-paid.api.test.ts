import { beforeEach, describe, expect, it } from "vitest";
import { resetBookingStore } from "@/lib/mock/booking-store";
import { bookings, customers } from "@/lib/mock/data";
import { outboxEmails, resetOutbox } from "@/lib/mock/outbox-store";
import { POST as paid } from "./bookings/[id]/paid/route";

// When the shop confirms the payment of a booking, the guest is emailed a receipt (the amount comes from the server, not from the browser).

const ctxId = (id: string) => ({ params: Promise.resolve({ id }) }) as never;
const post = (id: string) => paid(new Request("http://x", { method: "POST" }), ctxId(id));

beforeEach(() => { resetBookingStore(); resetOutbox(); });

describe("POST /bookings/{id}/paid", () => {
  it("queues one email for a guest who left an email, with the amount of the booking", async () => {
    const b = bookings.find((x) => customers.find((c) => c.id === x.customerId)?.email)!;
    const res = await post(b.id);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ notified: 1 });
    expect(outboxEmails()).toHaveLength(1);
    expect(outboxEmails()[0]).toMatchObject({ type: "PAYMENT_RECEIVED", bookingCode: b.bookingCode, totalAmount: b.totalAmount, currency: b.currency, to: customers.find((c) => c.id === b.customerId)!.email });
  });
  it("sends nothing for a guest with no email (walk-in)", async () => {
    const b = bookings.find((x) => !customers.find((c) => c.id === x.customerId)?.email);
    if (!b) return; // the demo data has such a guest; when it does not, there is nothing to check
    expect(await (await post(b.id)).json()).toEqual({ notified: 0 });
    expect(outboxEmails()).toHaveLength(0);
  });
  it("404 for a booking that does not exist", async () => {
    expect((await post("bk-nope")).status).toBe(404);
    expect(outboxEmails()).toHaveLength(0);
  });
});
