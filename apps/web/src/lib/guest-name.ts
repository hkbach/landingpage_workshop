import type { Booking, Customer } from "@/lib/types";

/**
 * The name of the guest of a booking: the name typed when it was made (each booking keeps its own, so the email and the check-in list say what the guest wrote),
 * or the name of the customer for a booking that has none. The customer itself is found by email and keeps one name.
 */
export const guestNameOf = (b: Pick<Booking, "guestName" | "customerId">, customers: readonly Pick<Customer, "id" | "fullName">[]): string =>
  b.guestName ?? customers.find((c) => c.id === b.customerId)?.fullName ?? "";
