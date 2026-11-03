import { describe, expect, it } from "vitest";
import { draftChanges, draftPaid, withChoice, type PaymentDraft } from "./payment-draft";

const unpaid = { id: "bk-1", paymentStatus: "UNPAID" as const };
const paid = { id: "bk-2", paymentStatus: "PAID" as const };
const none: PaymentDraft = new Map();

describe("payment draft", () => {
  it("shows the status a booking has until something is chosen", () => {
    expect(draftPaid(unpaid, none)).toBe(false);
    expect(draftPaid(paid, none)).toBe(true);
  });
  it("shows what was chosen", () => {
    expect(draftPaid(unpaid, withChoice(none, unpaid, true))).toBe(true);
    expect(draftPaid(paid, withChoice(none, paid, false))).toBe(false);
  });
  it("keeps only the choices that differ from the booking, so there is nothing to submit when the owner changes their mind", () => {
    const chosen = withChoice(none, unpaid, true);
    expect(draftChanges(chosen)).toEqual([{ id: "bk-1", paid: true }]);
    expect(draftChanges(withChoice(chosen, unpaid, false))).toEqual([]);
    expect(draftChanges(withChoice(none, paid, true))).toEqual([]);
  });
  it("never changes the draft it was given", () => {
    withChoice(none, unpaid, true);
    expect(none.size).toBe(0);
  });
  it("lists the choices for several bookings", () => {
    const d = withChoice(withChoice(none, unpaid, true), paid, false);
    expect(draftChanges(d)).toEqual([{ id: "bk-1", paid: true }, { id: "bk-2", paid: false }]);
  });
});
