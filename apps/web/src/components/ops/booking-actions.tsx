"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Ban, CalendarClock, LogIn, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Booking, Session } from "@/lib/types";
import { canTransition, type BookingAction } from "@/lib/booking-state";
import { ReasonDialog, RescheduleDialog } from "./booking-dialogs";
import type { OpResult } from "./use-ops-state";

export interface BookingOps {
  now: Date;
  sessions: Session[];
  perform: (bookingId: string, action: BookingAction, reason?: string) => OpResult;
  reschedule: (bookingId: string, targetSessionId: string) => OpResult;
}

const ICONS = { CHECK_IN: LogIn, UNDO_CHECK_IN: Undo2, CANCEL: Ban, RESCHEDULE: CalendarClock } as const;
const PRIMARY: BookingAction[] = ["CHECK_IN", "UNDO_CHECK_IN", "CANCEL"];

/**
 * Quick actions for one booking. Enablement comes from the pure state machine (`canTransition`).
 * Payments are confirmed on the Sessions screen (FR-PAY-01), not here.
 */
export function BookingActions({
  booking, session, ops, timezone, compact = false, showReschedule = false, checkInOnly = false,
}: { booking: Booking; session: Session; ops: BookingOps; timezone: string; compact?: boolean; showReschedule?: boolean; checkInOnly?: boolean }) {
  const t = useTranslations("ops");
  const [dialog, setDialog] = useState<"cancel" | "reschedule" | null>(null);
  const [message, setMessage] = useState<string>();
  const states = canTransition(booking, session, ops.now);

  function run(action: BookingAction, reason?: string) {
    const r = ops.perform(booking.id, action, reason);
    setMessage(r.ok ? undefined : t(`blocked.${r.reason}`));
    return r.ok;
  }

  const actions: BookingAction[] = (showReschedule ? [...PRIMARY, "RESCHEDULE" as const] : PRIMARY).filter((a) => {
    // Hide actions that can never apply from the current status: check-in, cancel and re-schedule while the booking is open (not confirmed or
    // confirmed), uncheck-in once it is checked in.
    if (checkInOnly && a === "CANCEL") return false; // the Today screen only checks guests in (and undoes it): no Cancel booking
    if (a === "UNDO_CHECK_IN") return booking.status === "CHECKED_IN";
    return booking.status === "NOT_CONFIRMED" || booking.status === "CONFIRMED";
  });
  const size = compact ? "sm" : "default";

  return (
    <div className="grid content-start gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        {actions.map((a) => {
          const Icon = ICONS[a];
          const st = states[a];
          return (
            <Button
              key={a} size={size} variant={a === "CANCEL" ? "destructive" : a === "CHECK_IN" ? "default" : "outline"}
              disabled={!st.allowed}
              title={!st.allowed && st.reason ? t(`blocked.${st.reason}`) : undefined}
              onClick={() => {
                if (a === "CANCEL") setDialog("cancel");
                else if (a === "RESCHEDULE") setDialog("reschedule");
                else run(a);
              }}
            >
              <Icon aria-hidden="true" />
              {t(`action.${a}`)}
            </Button>
          );
        })}
      </div>
      <p role="status" className="text-xs text-destructive empty:hidden">{message}</p>

      <ReasonDialog
        open={dialog === "cancel"} onOpenChange={(o) => !o && setDialog(null)}
        title={t("cancelBooking.title")} description={t("cancelBooking.hint", { code: booking.bookingCode })}
        label={t("cancelBooking.reason")} confirmLabel={t("cancelBooking.confirm")}
        onConfirm={(reason) => { if (run("CANCEL", reason)) setDialog(null); }}
      />
      {showReschedule ? (
        <RescheduleDialog
          open={dialog === "reschedule"} onOpenChange={(o) => !o && setDialog(null)} booking={booking}
          sessions={ops.sessions} timezone={timezone}
          onSubmit={(id) => { const r = ops.reschedule(booking.id, id); if (r.ok) setDialog(null); return r.ok; }}
        />
      ) : null}
    </div>
  );
}
