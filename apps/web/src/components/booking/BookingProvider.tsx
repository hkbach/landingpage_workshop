"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { Locale } from "@workshop/shared";
import { BookingActionsContext } from "@/components/sections/booking-context";
import type { PageTheme, Session, Workshop } from "@/lib/types";
import { BookingModal, type BookingShop } from "./BookingModal";

/** Owns the booking modal state and exposes `open(workshopId?)` to hero CTA / workshop cards via context. */
export function BookingProvider({ children, shop, workshops, sessions, theme, locale, basePath }: {
  children: ReactNode; shop: BookingShop; workshops: Workshop[]; sessions: Session[]; theme: PageTheme; locale: Locale; basePath: string;
}) {
  const [state, setState] = useState<{ open: boolean; workshopId?: string }>({ open: false });
  const open = useCallback((workshopId?: string) => setState({ open: true, workshopId }), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <BookingActionsContext.Provider value={value}>
      {children}
      <BookingModal
        open={state.open} onOpenChange={(o) => setState((s) => ({ ...s, open: o }))} initialWorkshopId={state.workshopId}
        shop={shop} workshops={workshops} sessions={sessions} theme={theme} locale={locale} basePath={basePath}
      />
    </BookingActionsContext.Provider>
  );
}
