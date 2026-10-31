"use client";

import { createContext, useContext } from "react";

/** Lets section renderers open the booking modal without knowing about it (no-op in the builder preview). */
export interface BookingActions { open: (workshopId?: string) => void }

export const BookingActionsContext = createContext<BookingActions>({ open: () => {} });
export function useBookingActions(): BookingActions {
  return useContext(BookingActionsContext);
}
