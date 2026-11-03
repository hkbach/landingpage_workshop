// The payment changes made in the payment popups of a session are only a draft until the owner presses Submit (or Completed): nothing is saved, no status
// of a booking changes and no email is sent while the owner works in the popup.

/** What the owner chose for some bookings (booking id -> paid or not); a booking that is not in it keeps the status it has. */
export type PaymentDraft = ReadonlyMap<string, boolean>;

interface Payable { id: string; paymentStatus: "UNPAID" | "PAID" }

/** Whether the booking is Paid as the popup shows it: what the owner chose, or its status when nothing was chosen. */
export const draftPaid = (b: Payable, draft: PaymentDraft): boolean => draft.get(b.id) ?? b.paymentStatus === "PAID";

/** The draft with the choice for one booking; choosing what the booking already is takes the choice back (so nothing is left to submit for it). */
export function withChoice(draft: PaymentDraft, b: Payable, paid: boolean): PaymentDraft {
  const next = new Map(draft);
  if (paid === (b.paymentStatus === "PAID")) next.delete(b.id);
  else next.set(b.id, paid);
  return next;
}

/** The choices to apply when the owner submits. */
export const draftChanges = (draft: PaymentDraft): { id: string; paid: boolean }[] => [...draft].map(([id, paid]) => ({ id, paid }));
