// SERVER-ONLY: the shop settings that the public pages depend on, as the owner saved them in Settings, until apps/api exists.
// TODO(api): the settings of the shop (organization_id) in the database; this holds the demo shop's booking cut-off only.
import { currentShop } from "./data";

export const MAX_BOOKING_CUTOFF_MINUTES = 10_080;

const g = globalThis as unknown as { __bookingCutoff?: number };

/** Minutes before a session starts at which online booking closes (BR / FR-BOOK-01). */
export const bookingCutoffMinutes = (): number => g.__bookingCutoff ?? currentShop.bookingCutoffMinutes;

/** Test helper: back to the demo value. */
export function resetShopSettingsStore(): void {
  delete g.__bookingCutoff;
}

/** False when the value is not a whole number from 0 to a week. */
export function setBookingCutoffMinutes(minutes: number): boolean {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MAX_BOOKING_CUTOFF_MINUTES) return false;
  g.__bookingCutoff = minutes;
  return true;
}
